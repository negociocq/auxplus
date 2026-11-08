/** Financial mutations execute only on the server, once per payment. */
import { toast } from "sonner";
import type { AppData, Item, User } from "@/types";
import { isRevenueFolderType } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { loadAutomationsConfig } from "@/lib/automationsConfig";
import { extractPaymentsFromNotes } from "@/lib/payments";
import { mergeItemDue } from "../../supabase/functions/_shared/itemDue";
import { fetchMercadoPagoPaymentStatus, mapMpStatusToOrder } from "@/lib/mercadoPagoApi";
import { getMpOrderExpiresAt, loadMpOrders, loadMpOrdersRemote, patchMpOrder, pruneStaleMpOrders, saveMpOrders, type MpRenewOrder } from "@/lib/mercadoPagoOrders";

export const MP_ORDERS_CHANGED_EVENT = "auxplus:mp-orders-changed";
const releasingIds = new Set<string>();
export type MpReleaseCtx = {
  user: User;
  items: Item[];
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  silent?: boolean;
};
function notifyOrdersChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MP_ORDERS_CHANGED_EVENT));
}
function persistOrders(userId: string, orders: MpRenewOrder[]) {
  saveMpOrders(userId, orders);
  notifyOrdersChanged();
}
export function revenueItemsFromData(data: AppData, userId: string): Item[] {
  const folderIds = new Set(
    data.folders
      .filter((f) => f.userId === userId && isRevenueFolderType(f.type))
      .map((f) => f.id),
  );
  return data.items.filter(
    (i) => folderIds.has(i.folderId) && i.isActive !== false,
  );
}

export async function releasePaidMpOrder(ctx: MpReleaseCtx, order: MpRenewOrder): Promise<void> {
  if (releasingIds.has(order.id) || order.blocked) return;
  releasingIds.add(order.id);
  try {
    const orders = await loadMpOrdersRemote(ctx.user.id);
    let latest = orders.find(row => row.id === order.id) || order;
    if (!latest.releasedAt && latest.status !== "released") {
      if (latest.status !== "approved") return;
      // This endpoint independently verifies payment with Mercado Pago. Never
      // renew locally, even on timeout, a stale tab, or a missing response.
      const { data, error } = await supabase.functions.invoke("mp-webhook", {
        body: { type: "order", data: { id: latest.mpPaymentId } },
      });
      if (error || data?.ok === false || data?.results?.some((r: { ok?: boolean }) => r.ok === false)) {
        throw new Error("Pagamento recebido; liberação requer conferência no servidor. Não renovamos novamente.");
      }
      latest = (await loadMpOrdersRemote(ctx.user.id)).find(row => row.id === order.id) || latest;
    }
    if (latest.releasedAt || latest.status === "released") {
      if (latest.itemRefId) {
        const { data: row, error } = await supabase.from("items").select("id,due_date,due_time,notes,price,status").eq("id", latest.itemRefId).maybeSingle();
        if (error) throw error;
        if (row) ctx.setData(prev => ({ ...prev, items: prev.items.map(item => item.id === String(row.id) ? {
          ...item, dueDate: mergeItemDue(row.due_date, row.due_time), notes: String(row.notes || ""),
          payments: extractPaymentsFromNotes(row.notes), price: Number(row.price) || 0,
          status: row.status || item.status,
        } : item) }));
      }
      notifyOrdersChanged();
    }
  } catch (e) {
    if (!ctx.silent) toast.error(e instanceof Error ? e.message : "Não foi possível conferir a liberação. Nenhuma renovação local foi executada.");
  } finally { releasingIds.delete(order.id); }
}

export async function pollAndReleaseMpOrders(
  ctx: MpReleaseCtx,
): Promise<{ approved: number; waiting: number; removed: number }> {
  const { user, silent } = ctx;
  const config = loadAutomationsConfig(user.id);
  if (!config.mpAccessToken.trim()) {
    if (!silent) {
      toast.error("Configure o Access Token do Mercado Pago em Conexões");
    }
    return { approved: 0, waiting: 0, removed: 0 };
  }

  // Sincroniza nuvem → local (pedidos criados pelo webhook)
  await loadMpOrdersRemote(user.id).catch(() => undefined);

  const loaded = loadMpOrders(user.id);
  let next = pruneStaleMpOrders(loaded);
  let changed = next.length !== loaded.length;
  let removed = loaded.length - next.length;
  const pending = next.filter((o) => o.status === "pending");
  const stuckApproved = next.filter(
    (o) => o.status === "approved" && !o.releasedAt,
  );
  if (!pending.length && !stuckApproved.length) {
    if (changed) persistOrders(user.id, next);
    if (!silent) {
      toast.message(
        removed > 0
          ? `${removed} PIX expirado(s) removido(s) da lista`
          : "Nenhum PIX pendente para verificar",
      );
    }
    return { approved: 0, waiting: 0, removed };
  }

  const approved: MpRenewOrder[] = [...stuckApproved];
  let stillWaiting = 0;
  const now = Date.now();

  for (const order of pending) {
    if (now >= getMpOrderExpiresAt(order)) {
      changed = true;
      removed += 1;
      next = next.filter((o) => o.id !== order.id);
      continue;
    }
    try {
      const st = await fetchMercadoPagoPaymentStatus({
        accessToken: config.mpAccessToken,
        paymentId: order.mpPaymentId,
      });
      if (st.date_of_expiration && st.date_of_expiration !== order.expiresAt) {
        changed = true;
        next = patchMpOrder(next, order.id, {
          expiresAt: st.date_of_expiration,
        });
      }
      const expAt = st.date_of_expiration
        ? Date.parse(st.date_of_expiration)
        : getMpOrderExpiresAt(next.find((o) => o.id === order.id) || order);
      if (Number.isFinite(expAt) && now >= expAt) {
        changed = true;
        removed += 1;
        next = next.filter((o) => o.id !== order.id);
        continue;
      }
      const mapped = mapMpStatusToOrder(st.status, st.status_detail);
      if (mapped === "pending") {
        stillWaiting += 1;
        continue;
      }
      changed = true;
      if (
        mapped === "expired" ||
        mapped === "cancelled" ||
        mapped === "rejected"
      ) {
        removed += 1;
        next = next.filter((o) => o.id !== order.id);
        continue;
      }
      next = patchMpOrder(next, order.id, {
        status: mapped === "approved" ? "approved" : mapped,
        paidAt:
          mapped === "approved" ? new Date().toISOString() : order.paidAt,
        expiresAt: st.date_of_expiration || order.expiresAt,
      });
      const updated = next.find((o) => o.id === order.id);
      if (updated && mapped === "approved") approved.push(updated);
    } catch {
      /* tenta de novo no próximo tick */
    }
  }

  if (changed) persistOrders(user.id, next);

  const releaseCtx: MpReleaseCtx = {
    ...ctx,
    items: ctx.items,
    silent: false, // liberação sempre notifica sucesso/falha
  };

  for (const order of approved) {
    await releasePaidMpOrder(releaseCtx, order);
  }

  if (!silent) {
    if (approved.length > 0) {
      toast.success(
        approved.length === 1
          ? "Pagamento confirmado — liberando"
          : `${approved.length} pagamentos confirmados`,
      );
    } else if (removed > 0 && stillWaiting === 0) {
      toast.message(`${removed} PIX expirado(s)/cancelado(s) removido(s)`);
    } else if (stillWaiting > 0) {
      toast.message(
        stillWaiting === 1
          ? "Ainda aguardando o pagamento deste PIX"
          : `Ainda aguardando pagamento de ${stillWaiting} PIX`,
      );
    } else {
      toast.message("Verificação concluída");
    }
  }

  return { approved: approved.length, waiting: stillWaiting, removed };
}
