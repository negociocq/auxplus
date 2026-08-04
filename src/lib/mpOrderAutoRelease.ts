/**
 * Liberação automática de pedidos PIX (renovação / créditos / teste→plano).
 * Usado pelo hook global (AppLayout) e pelo painel WhatsApp → PIX.
 */
import { toast } from "sonner";
import type { AppData, Item, User } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { formatBrDate } from "@/lib/format";
import {
  loadAutomationsConfig,
  saveAutomationsConfig,
} from "@/lib/automationsConfig";
import {
  applyPanelDueToItem,
  applyRenewalToItem,
  applyResellerRechargeToItem,
  createIptvJob,
  loadIptvJobs,
  patchIptvJob,
  saveIptvJobs,
} from "@/lib/iptvAutomation";
import {
  addIptvResellerCredits,
  buildReleaseFailedClientMessage,
  buildRenewalReceiptMessage,
  buildResellerCreditsReceiptMessage,
  resolveIptvResellerPanelId,
  ensureIptvToken,
  findIptvUserByUsername,
  getLastIssuedIptvToken,
  IPTV_RENEW_OPTIONS,
  listIptvResellers,
  renewIptvUser,
  type IptvPanelCreds,
} from "@/lib/iptvPanelApi";
import {
  loadWaBotStateRemote,
  saveWaBotStateRemote,
} from "@/lib/whatsappBotConfig";
import { enqueueWaHumanAlertRemote } from "@/lib/whatsappBotAlerts";
import { notifyUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
import {
  fetchMercadoPagoPaymentStatus,
  mapMpStatusToOrder,
} from "@/lib/mercadoPagoApi";
import {
  getMpOrderExpiresAt,
  loadMpOrders,
  loadMpOrdersRemote,
  patchMpOrder,
  pruneStaleMpOrders,
  saveMpOrders,
  type MpRenewOrder,
} from "@/lib/mercadoPagoOrders";
import {
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
  loadIptvPlatformConfig,
} from "@/lib/platformApi";
import {
  fetchEvolutionStatus,
  sendEvolutionText,
} from "@/lib/whatsappAutomation";
import { isRevenueFolderType } from "@/types";

export const MP_ORDERS_CHANGED_EVENT = "auxplus:mp-orders-changed";

const releasingIds = new Set<string>();

/**
 * Trava atômica de liberação (por pedido). Só um lado — cliente ou servidor
 * (mp-webhook) — pode liberar o mesmo PIX. O `insert` com chave única é o
 * compare-and-set: quem inserir primeiro vence; o outro lado desiste.
 * Travas velhas (> TTL, ex.: crash) são removidas para permitir retry.
 */
const CLAIM_TTL_MS = 2 * 60 * 1000;
const claimKey = (orderId: string) => `mp_claim_${orderId}`;

async function acquireReleaseClaim(
  orderId: string,
  claimer: string,
): Promise<boolean> {
  const key = claimKey(orderId);
  const now = Date.now();
  try {
    const { data: existing } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const existingAt = Number(
      (existing?.value as { at?: number } | undefined)?.at || 0,
    );
    if (existing && Number.isFinite(existingAt) && now - existingAt < CLAIM_TTL_MS) {
      return false; // outro processo está liberando (ou já liberou)
    }
    if (existing) {
      // trava velha (crash) → remove para poder assumir
      await supabase.from("platform_settings").delete().eq("key", key);
    }
    const ins = await supabase
      .from("platform_settings")
      .insert({
        key,
        value: { at: now, claimer },
        updated_at: new Date().toISOString(),
      })
      .select("key");
    return Array.isArray(ins.data) && ins.data.length > 0;
  } catch {
    return false;
  }
}

async function releaseClaim(orderId: string) {
  try {
    await supabase
      .from("platform_settings")
      .delete()
      .eq("key", claimKey(orderId));
  } catch {
    /* TTL limpa a trava */
  }
}

export type MpReleaseCtx = {
  user: User;
  items: Item[];
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  /** true = sem toasts de “aguardando”; ainda mostra sucesso/falha da liberação */
  silent?: boolean;
};

function notifyOrdersChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MP_ORDERS_CHANGED_EVENT));
}

function persistOrders(userId: string, orders: MpRenewOrder[]) {
  saveMpOrders(userId, orders);
  notifyOrdersChanged();
}

function persistToken(userId: string, token: string) {
  if (!userId || !token) return;
  const cur = loadAutomationsConfig(userId);
  saveAutomationsConfig(userId, { ...cur, iptvBearerToken: token });
}

async function panelCredsFor(userId: string): Promise<IptvPanelCreds> {
  const plat = await loadIptvPlatformConfig();
  const cur = loadAutomationsConfig(userId);
  return {
    apiBaseUrl: plat.apiBaseUrl || cur.iptvApiBaseUrl,
    bearerToken: cur.iptvBearerToken.trim(),
    regPassword: plat.regPassword.trim() || undefined,
    defaultPackage: plat.packageId.trim() || "1",
    username: cur.iptvUsername.trim() || undefined,
    password: cur.iptvPassword || undefined,
    apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
  };
}

async function sendWa(user: User, phone: string, text: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return false;
  try {
    const evo = await loadEvolutionPlatformConfig();
    if (!isEvolutionConfigured(evo)) return false;
    const runtime = {
      apiBaseUrl: evo.apiBaseUrl,
      apiKey: evo.apiKey,
      instanceName: instanceNameForUser(
        evo.instancePrefix,
        user.id,
        user.username,
      ),
    };
    if ((await fetchEvolutionStatus(runtime)) !== "open") return false;
    await sendEvolutionText(runtime, digits, text);
    return true;
  } catch {
    return false;
  }
}

async function handoffFailure(
  user: User,
  order: MpRenewOrder,
  username: string,
) {
  const phone = String(order.phone || "").replace(/\D/g, "");
  if (phone.length < 10) return;
  const role =
    order.kind === "reseller_credits"
      ? "reseller"
      : order.kind === "test_activate"
        ? "unknown"
        : "client";
  try {
    await sendWa(
      user,
      phone,
      buildReleaseFailedClientMessage(username, order.kind || "renew"),
    );
    const state = await loadWaBotStateRemote(user.id);
    state.humanPaused[phone] = true;
    state.sessions[phone] = {
      ...(state.sessions[phone] || {
        state: "human",
        updatedAt: new Date().toISOString(),
      }),
      state: "human",
      role,
      panelUsername: username || state.sessions[phone]?.panelUsername,
      updatedAt: new Date().toISOString(),
    };
    await saveWaBotStateRemote(user.id, state);
    await enqueueWaHumanAlertRemote(user.id, phone, role);
  } catch {
    /* opcional */
  }
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

export async function releasePaidMpOrder(
  ctx: MpReleaseCtx,
  order: MpRenewOrder,
): Promise<void> {
  const { user, items, setData } = ctx;
  if (releasingIds.has(order.id)) return;
  // Sincroniza nuvem → local para enxergar liberação/trava do servidor
  // (mp-webhook) antes de liberar — evita renovar o mesmo PIX 2×.
  await loadMpOrdersRemote(user.id).catch(() => undefined);
  let latest = loadMpOrders(user.id).find((o) => o.id === order.id) || order;
  if (latest.status === "released" || latest.releasedAt) return;
  // Servidor (mp-webhook) já está liberando — evita renovar 2×
  if (latest.error === "__releasing__") {
    const t = Date.parse(String(latest.updatedAt || "")) || 0;
    if (Date.now() - t < 2 * 60 * 1000) return;
  }
  if (latest.status !== "approved") return;

  // TRAVA ATÔMICA: só um lado (cliente ou servidor) pode liberar o pedido.
  const gotClaim = await acquireReleaseClaim(order.id, "client");
  if (!gotClaim) return; // o outro lado já está liberando (ou já liberou)

  // Re-checa após adquirir a trava (pode ter sido liberado no meio do caminho).
  latest = loadMpOrders(user.id).find((o) => o.id === order.id) || latest;
  if (latest.status === "released" || latest.releasedAt) {
    await releaseClaim(order.id);
    return;
  }

  // Marca liberação em andamento na nuvem (mesma trava legada do servidor).
  await persistOrders(
    user.id,
    patchMpOrder(loadMpOrders(user.id), order.id, {
      error: "__releasing__",
    }),
  );

  releasingIds.add(order.id);
  const config = loadAutomationsConfig(user.id);
  try {
    const item = items.find((i) => i.id === order.itemRefId);
    const username = (order.panelUsername || item?.itemId || "").trim();
    if (!username && !item) throw new Error("Pedido sem usuário vinculado");

    const credsBase = await panelCredsFor(user.id);
    const ensured = await ensureIptvToken(credsBase);
    if (ensured.renewed) persistToken(user.id, ensured.token);
    const creds = { ...credsBase, bearerToken: ensured.token };

    if (order.kind === "test_activate") {
      if (!creds.bearerToken.trim()) {
        throw new Error("Conecte a UniPlay para liberar o plano");
      }
      if (!username) throw new Error("Pedido sem usuário do teste");
      let remoteId = order.testRemoteId;
      if (remoteId == null || remoteId === "") {
        const remote = await findIptvUserByUsername(creds, username);
        if (!remote?.id) {
          throw new Error(`Usuário ${username} não encontrado no UniPlay`);
        }
        remoteId = remote.id;
      }
      const months = Math.max(1, Number(order.months) || 1);
      await renewIptvUser(creds, remoteId, {
        months,
        credits: Math.max(1, Number(order.credits) || 1),
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(user.id, issued);

      const currentJobs = loadIptvJobs(user.id);
      saveIptvJobs(user.id, [
        createIptvJob({
          kind: "renew",
          status: "done",
          itemRefId: order.itemRefId || "",
          clientName: order.clientName || username,
          panelUsername: username,
          panelRemoteId: remoteId,
          phone: order.phone || "",
          dueDate: order.dueDate ?? null,
          months,
          testHours: config.testHours,
          note: `WhatsApp · teste→plano · ${months}m · MP ${order.mpPaymentId}`,
        }),
        ...currentJobs,
      ]);

      persistOrders(
        user.id,
        patchMpOrder(loadMpOrders(user.id), order.id, {
          status: "released",
          paidAt: latest.paidAt || new Date().toISOString(),
          releasedAt: new Date().toISOString(),
          error: undefined,
        }),
      );

      const screens = Math.max(1, Math.floor(Number(order.screens) || 1));
      const testApp =
        order.testApp === "prime"
          ? "prime"
          : order.testApp === "fun"
            ? "fun"
            : "";
      const phone = String(order.phone || "").replace(/\D/g, "");
      await sendWa(
        user,
        phone,
        `✅ *Pagamento confirmado!*\n\n` +
          `Plano liberado no usuário *${username}*.\n` +
          `Bom proveito!`,
      );
      if (
        screens > 1 &&
        (testApp === "fun" || testApp === "prime") &&
        order.testPassword &&
        phone.length >= 10
      ) {
        try {
          const state = await loadWaBotStateRemote(user.id);
          state.sessions[phone] = {
            ...(state.sessions[phone] || {
              state: "idle",
              updatedAt: new Date().toISOString(),
            }),
            state: "test_plan_await_mac",
            role: "unknown",
            testUsername: username,
            testPassword: order.testPassword,
            testRemoteId: remoteId,
            testApp,
            activationsTotal: screens,
            activationsDone: 1,
            updatedAt: new Date().toISOString(),
          };
          await saveWaBotStateRemote(user.id, state);
          await new Promise((r) => window.setTimeout(r, 1400));
          const appName = testApp === "prime" ? "Prime IPTV" : "FunPlay";
          await sendWa(
            user,
            phone,
            `Seu plano inclui *${screens} telas*. A *1ª* já foi no teste.\n\n` +
              `Envie o *MAC* da *2ª tela* no *${appName}*.\n\n` +
              `_Formatos: aa:bb:cc:dd:ee:ff ou aabbccddeeff.\n` +
              `Digite *pular* para encerrar, ou *atendente*._`,
          );
        } catch {
          /* ignore */
        }
      }
      notifyUniplayCreditsChanged({
        spent: Math.max(1, Number(order.credits) || 1),
        source: "pix_test_activate",
      });
      toast.success(`Pagamento confirmado · plano liberado (${username})`);
      return;
    }

    if (order.kind === "reseller_credits") {
      if (!creds.bearerToken.trim()) {
        throw new Error("Conecte a UniPlay para liberar créditos");
      }
      const credits = Math.max(10, Math.floor(Number(order.credits) || 10));
      const resellers = await listIptvResellers(creds, {
        search: username,
        perPage: 100,
      });
      const want = username.toLowerCase();
      const remote = resellers.find(
        (r) => String(r.username || "").toLowerCase() === want,
      );
      if (!remote) {
        throw new Error(
          `Revendedor ${username || "?"} não encontrado no UniPlay.`,
        );
      }
      const resellerId = resolveIptvResellerPanelId(remote);
      if (resellerId == null) {
        throw new Error(`Revendedor ${username} sem ID numérico no UniPlay.`);
      }
      const amountBrl = Number(order.amount) || 0;
      await addIptvResellerCredits(creds, {
        resellerId,
        credits,
        saleBrl: amountBrl > 0 ? amountBrl : undefined,
        reason: `AuxPlus PIX ${order.id}`,
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(user.id, issued);

      const paidAt = (latest.paidAt || new Date().toISOString()).slice(0, 10);
      if (item) {
        const updated = applyResellerRechargeToItem(item, {
          credits,
          amountBrl,
          paidAt,
        });
        setData((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.id === item.id ? updated : i)),
        }));
      }

      persistOrders(
        user.id,
        patchMpOrder(loadMpOrders(user.id), order.id, {
          status: "released",
          paidAt: latest.paidAt || new Date().toISOString(),
          releasedAt: new Date().toISOString(),
          error: undefined,
        }),
      );
      notifyUniplayCreditsChanged({
        spent: credits,
        source: "pix_reseller_credits",
      });
      const phone = String(order.phone || item?.phone || "").replace(/\D/g, "");
      const sent = await sendWa(
        user,
        phone,
        buildResellerCreditsReceiptMessage(username, credits, amountBrl),
      );
      toast.success(
        sent
          ? `${credits} créditos liberados · WhatsApp enviado`
          : `Pagamento confirmado · ${credits} créditos para ${username}`,
      );
      return;
    }

    if (!item) throw new Error("Cliente do pedido não encontrado");
    const option =
      IPTV_RENEW_OPTIONS.find((o) => o.months === order.months) || {
        months: Math.max(1, Number(order.months) || 1),
        credits: Math.max(
          1,
          Number(order.credits) || Number(order.months) || 1,
        ),
        label: `${order.months} mês(es)`,
      };

    const canRenewUniplay =
      Boolean(item.itemId.trim()) && Boolean(creds.bearerToken.trim());
    let updated = applyRenewalToItem(item, option.months);

    if (canRenewUniplay) {
      const currentJobs = loadIptvJobs(user.id);
      const todayKey = new Date().toISOString().slice(0, 10);
      const dueKey = String(item.dueDate || "").slice(0, 10);
      const isExtend = Boolean(dueKey && dueKey >= todayKey);
      const verb = isExtend ? "Estendido" : "Renovado";
      const job = createIptvJob({
        kind: "renew",
        status: "doing",
        itemRefId: item.id,
        clientName: item.name,
        panelUsername: item.itemId.trim(),
        phone: item.phone || order.phone || "",
        dueDate: item.dueDate,
        months: option.months,
        testHours: config.testHours,
        note: `WhatsApp · PIX · MP ${order.mpPaymentId}`,
      });
      let nextJobs = [job, ...currentJobs];
      saveIptvJobs(user.id, nextJobs);

      const remote = await findIptvUserByUsername(creds, item.itemId.trim());
      if (!remote?.id) {
        throw new Error(`Usuário ${item.itemId} não encontrado no painel`);
      }
      await renewIptvUser(creds, remote.id, option);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(user.id, issued);

      let panelExp: string | null | undefined;
      try {
        const after = await findIptvUserByUsername(creds, item.itemId.trim());
        panelExp = after?.exp_date ?? after?.expDate;
      } catch {
        panelExp = remote.exp_date ?? remote.expDate;
      }
      updated = applyPanelDueToItem(item, {
        panelExp,
        months: option.months,
      });
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "done",
        dueDate: updated.dueDate,
        note: `WhatsApp · ${verb} · ${option.label} · vence ${formatBrDate(updated.dueDate)} · MP ${order.mpPaymentId}`,
      });
      saveIptvJobs(user.id, nextJobs);
    } else {
      const todayKey = new Date().toISOString().slice(0, 10);
      const dueKey = String(item.dueDate || "").slice(0, 10);
      const isExtend = Boolean(dueKey && dueKey >= todayKey);
      const verb = isExtend ? "Estendido" : "Renovado";
      saveIptvJobs(user.id, [
        createIptvJob({
          kind: "renew",
          status: "done",
          itemRefId: item.id,
          clientName: item.name,
          panelUsername: item.itemId.trim() || username,
          phone: item.phone || order.phone || "",
          dueDate: updated.dueDate,
          months: option.months,
          testHours: config.testHours,
          note: `WhatsApp · ${verb} · AuxPlus · ${option.label} · MP ${order.mpPaymentId}`,
        }),
        ...loadIptvJobs(user.id),
      ]);
    }

    setData((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === item.id ? updated : i)),
    }));

    persistOrders(
      user.id,
      patchMpOrder(loadMpOrders(user.id), order.id, {
        status: "released",
        paidAt: latest.paidAt || new Date().toISOString(),
        releasedAt: new Date().toISOString(),
        error: undefined,
      }),
    );
    if (canRenewUniplay) {
      notifyUniplayCreditsChanged({
        spent: option.credits,
        source: "pix_renew",
      });
    }
    const phone = String(order.phone || item.phone || "").replace(/\D/g, "");
    const sent = await sendWa(
      user,
      phone,
      buildRenewalReceiptMessage(
        item.itemId.trim() || username,
        formatBrDate(updated.dueDate),
      ),
    );
    toast.success(
      sent
        ? `Renovado · vence ${formatBrDate(updated.dueDate)} · WhatsApp enviado`
        : `Pagamento confirmado · vence ${formatBrDate(updated.dueDate)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao liberar";
    persistOrders(
      user.id,
      patchMpOrder(loadMpOrders(user.id), order.id, {
        status: "approved",
        error: msg,
      }),
    );
    await releaseClaim(order.id);
    const username = String(
      order.panelUsername ||
        items.find((i) => i.id === order.itemRefId)?.itemId ||
        "",
    ).trim();
    void handoffFailure(user, order, username);
    toast.error(`Pago, mas falhou a liberação: ${msg}`);
  } finally {
    releasingIds.delete(order.id);
  }
}

export async function pollAndReleaseMpOrders(
  ctx: MpReleaseCtx,
): Promise<{ approved: number; waiting: number; removed: number }> {
  const { user, silent } = ctx;
  const config = loadAutomationsConfig(user.id);
  if (!config.mpAccessToken.trim()) {
    if (!silent) {
      toast.error("Configure o Access Token do Mercado Pago em Automações");
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
