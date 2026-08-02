import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
  saveAutomationsConfig,
  type AutomationsConfig,
} from "@/lib/automationsConfig";
import {
  applyPanelDueToItem,
  applyRenewalToItem,
  applyResellerRechargeToItem,
  copyText,
  createIptvJob,
  loadIptvJobs,
  patchIptvJob,
  saveIptvJobs,
} from "@/lib/iptvAutomation";
import {
  addIptvResellerCredits,
  ensureIptvToken,
  findIptvUserByUsername,
  getLastIssuedIptvToken,
  IPTV_RENEW_OPTIONS,
  listIptvResellers,
  renewIptvUser,
  type IptvPanelCreds,
  type IptvRenewOption,
} from "@/lib/iptvPanelApi";
import {
  loadWaBotStateRemote,
  saveWaBotStateRemote,
} from "@/lib/whatsappBotConfig";
import {
  createMercadoPagoPix,
  fetchMercadoPagoPaymentStatus,
  mapMpStatusToOrder,
} from "@/lib/mercadoPagoApi";
import {
  buildPixWhatsappCodeOnly,
  buildPixWhatsappIntro,
  createMpOrder,
  findPendingMpOrderForClient,
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
  getWhatsappGreeting,
  sendEvolutionText,
} from "@/lib/whatsappAutomation";
import { isRevenueFolderType } from "@/types";
import { cn } from "@/lib/utils";
import { getPlanMonths, planPixAmount } from "@/lib/planMonths";

function pixAmountFromFolderPrice(
  price: number | null | undefined,
  months: number,
): number {
  return planPixAmount(Number(price) || 0, months);
}

export function PixRenewPanel() {
  const { user, data, setData } = useApp();
  const {
    user: maskUser,
    phone: maskPhone,
    money: maskMoney,
  } = useHideBalance();

  const [config, setConfig] = useState<AutomationsConfig>(() =>
    loadAutomationsConfig(user?.id || "0"),
  );
  const [mpOrders, setMpOrders] = useState<MpRenewOrder[]>([]);
  const [mpQ, setMpQ] = useState("");
  const [pixTargetId, setPixTargetId] = useState<string | null>(null);
  const [pixOption, setPixOption] = useState<IptvRenewOption>(
    IPTV_RENEW_OPTIONS[0],
  );
  const [pixBusy, setPixBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pixActiveOrderId, setPixActiveOrderId] = useState<string | null>(null);
  const releasingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const apply = (list: MpRenewOrder[]) => {
      const pruned = pruneStaleMpOrders(list);
      setMpOrders(pruned);
      if (pruned.length !== list.length) saveMpOrders(user.id, pruned);
    };
    apply(loadMpOrders(user.id));
    void loadMpOrdersRemote(user.id).then(apply);
    void loadAutomationsConfigRemote(user.id).then(setConfig);
    // Some sozinho quando o PIX do MP deixa de valer (sem clicar Verificar)
    const id = window.setInterval(() => {
      apply(loadMpOrders(user.id));
    }, 30_000);
    return () => window.clearInterval(id);
  }, [user]);

  const clients = useMemo(() => {
    if (!user) return [];
    const folderIds = new Set(
      data.folders
        .filter((f) => f.userId === user.id && isRevenueFolderType(f.type))
        .map((f) => f.id),
    );
    return data.items
      .filter((i) => folderIds.has(i.folderId) && i.isActive !== false)
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  }, [data.folders, data.items, user]);

  const filtered = useMemo(() => {
    const term = mpQ.trim().toLowerCase();
    if (term.length < 2) return [];
    return clients
      .filter(
        (i) =>
          i.name.toLowerCase().includes(term) ||
          i.itemId.toLowerCase().includes(term) ||
          (i.phone || "").includes(term),
      )
      .slice(0, 50);
  }, [clients, mpQ]);

  const persistMpOrders = (next: MpRenewOrder[]) => {
    if (!user) return;
    const pruned = pruneStaleMpOrders(next);
    setMpOrders(pruned);
    saveMpOrders(user.id, pruned);
  };

  const clientById = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c]));
    return map;
  }, [clients]);

  const persistToken = (token: string) => {
    if (!user || !token) return;
    const cur = loadAutomationsConfig(user.id);
    const next = { ...cur, iptvBearerToken: token };
    saveAutomationsConfig(user.id, next);
    setConfig(next);
  };

  const panelCreds = async (): Promise<IptvPanelCreds> => {
    const plat = await loadIptvPlatformConfig();
    const cur = user ? loadAutomationsConfig(user.id) : config;
    return {
      apiBaseUrl: plat.apiBaseUrl || cur.iptvApiBaseUrl,
      bearerToken: cur.iptvBearerToken.trim(),
      regPassword: plat.regPassword.trim() || undefined,
      defaultPackage: plat.packageId.trim() || "1",
      username: cur.iptvUsername.trim() || undefined,
      password: cur.iptvPassword || undefined,
      apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
    };
  };

  const openPixDialog = (itemId: string) => {
    const item = clients.find((i) => i.id === itemId);
    if (!item) return;
    if (!config.mpAccessToken.trim() || !config.mpPayerEmail.trim()) {
      toast.error(
        "Configure o Mercado Pago em Automações → Mercado Pago",
      );
      return;
    }
    if (!item.phone?.trim()) {
      toast.error("Cliente sem telefone — preencha na pasta para enviar o PIX");
      return;
    }
    if (!(Number(item.price) > 0)) {
      toast.error("Cliente sem preço na pasta — preencha o preço antes do PIX");
      return;
    }

    // Já existe PIX pendente deste usuário → só reabre o existente
    if (user) {
      const pruned = pruneStaleMpOrders(loadMpOrders(user.id));
      if (pruned.length !== loadMpOrders(user.id).length) {
        persistMpOrders(pruned);
      }
      const existing = findPendingMpOrderForClient(pruned, {
        itemRefId: item.id,
        panelUsername: item.itemId,
      });
      if (existing) {
        const opt =
          IPTV_RENEW_OPTIONS.find((o) => o.months === existing.months) ||
          IPTV_RENEW_OPTIONS[0];
        setPixOption(opt);
        setPixActiveOrderId(existing.id);
        setPixTargetId(itemId);
        toast.message(
          "Já existe um PIX aguardando para este usuário. Use o código abaixo ou aguarde expirar.",
        );
        return;
      }
    }

    const planM = getPlanMonths(item, config.renewMonths || 1);
    const preferred =
      IPTV_RENEW_OPTIONS.find((o) => o.months === planM) ||
      IPTV_RENEW_OPTIONS[0];
    setPixOption(preferred);
    setPixActiveOrderId(null);
    setPixTargetId(itemId);
  };

  const releasePaidOrder = async (order: MpRenewOrder) => {
    if (!user || releasingRef.current.has(order.id)) return;
    const latest = loadMpOrders(user.id).find((o) => o.id === order.id) || order;
    if (latest.status === "released") return;
    // Trava de crédito: nunca Extend Line sem PIX confirmado no MP
    if (latest.status !== "approved") {
      toast.error(
        "Pagamento ainda não confirmado — nenhum crédito será gasto no painel",
      );
      return;
    }
    releasingRef.current.add(order.id);
    try {
      const item = clients.find((i) => i.id === order.itemRefId);
      const username = (
        order.panelUsername ||
        item?.itemId ||
        ""
      ).trim();
      if (!username && !item) {
        throw new Error("Pedido sem usuário vinculado");
      }

      const credsBase = await panelCreds();
      const ensured = await ensureIptvToken(credsBase);
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...credsBase, bearerToken: ensured.token };

      // Teste WhatsApp → plano: só libera no UniPlay depois do PIX
      if (order.kind === "test_activate") {
        if (!creds.bearerToken.trim()) {
          throw new Error("Conecte a UniPlay para liberar o plano");
        }
        if (!username) {
          throw new Error("Pedido sem usuário do teste");
        }
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
        if (issued) persistToken(issued);

        {
          const currentJobs = loadIptvJobs(user.id);
          const job = createIptvJob({
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
          });
          saveIptvJobs(user.id, [job, ...currentJobs]);
        }

        persistMpOrders(
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

        try {
          const evo = await loadEvolutionPlatformConfig();
          if (isEvolutionConfigured(evo) && phone.length >= 10) {
            const runtime = {
              apiBaseUrl: evo.apiBaseUrl,
              apiKey: evo.apiKey,
              instanceName: instanceNameForUser(
                evo.instancePrefix,
                user.id,
                user.username,
              ),
            };
            if ((await fetchEvolutionStatus(runtime)) === "open") {
              await sendEvolutionText(
                runtime,
                phone,
                `✅ *Pagamento confirmado!*\n\n` +
                  `Plano liberado no usuário *${username}*.\n` +
                  `Bom proveito!`,
              );
              if (
                screens > 1 &&
                (testApp === "fun" || testApp === "prime") &&
                order.testPassword
              ) {
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
                const appName =
                  testApp === "prime" ? "Prime IPTV" : "FunPlay";
                await sendEvolutionText(
                  runtime,
                  phone,
                  `Seu plano inclui *${screens} telas*. A *1ª* já foi no teste.\n\n` +
                    `Envie o *MAC* da *2ª tela* no *${appName}*.\n\n` +
                    `_Formatos: aa:bb:cc:dd:ee:ff ou aabbccddeeff.\n` +
                    `Digite *pular* para encerrar, ou *atendente*._`,
                );
              }
            }
          }
        } catch {
          /* WhatsApp opcional */
        }

        toast.success(`Pagamento confirmado · plano liberado (${username})`);
        return;
      }

      // Revendedor: PIX pago → passa créditos no UniPlay
      if (order.kind === "reseller_credits") {
        if (!creds.bearerToken.trim()) {
          throw new Error("Conecte a UniPlay para liberar créditos");
        }
        const credits = Math.max(10, Math.floor(Number(order.credits) || 10));
        const resellers = await listIptvResellers(creds, {
          search: username,
          perPage: 100,
        });
        const remote =
          resellers.find(
            (r) =>
              String(r.username || "").toLowerCase() === username.toLowerCase(),
          ) || resellers[0];
        if (!remote?.id) {
          throw new Error(`Revendedor ${username || "?"} não encontrado no UniPlay`);
        }
        await addIptvResellerCredits(creds, {
          resellerId: remote.id,
          credits,
        });
        const issued = getLastIssuedIptvToken();
        if (issued) persistToken(issued);

        const paidAt = (
          latest.paidAt ||
          new Date().toISOString()
        ).slice(0, 10);
        if (item) {
          const updated = applyResellerRechargeToItem(item, {
            credits,
            amountBrl: Number(order.amount) || 0,
            paidAt,
          });
          setData((prev) => ({
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? updated : i)),
          }));
        }

        persistMpOrders(
          patchMpOrder(loadMpOrders(user.id), order.id, {
            status: "released",
            paidAt: latest.paidAt || new Date().toISOString(),
            releasedAt: new Date().toISOString(),
            error: undefined,
          }),
        );
        toast.success(
          `Pagamento confirmado · ${credits} créditos liberados para ${username}`,
        );
        return;
      }

      if (!item) throw new Error("Cliente do pedido não encontrado");
      // Meses do plano do cliente → créditos UniPlay (1/2/3/4/6→5/12→10)
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
        if (issued) persistToken(issued);

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
        const currentJobs = loadIptvJobs(user.id);
        const job = createIptvJob({
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
        });
        saveIptvJobs(user.id, [job, ...currentJobs]);
      }

      setData((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? updated : i)),
      }));

      persistMpOrders(
        patchMpOrder(loadMpOrders(user.id), order.id, {
          status: "released",
          paidAt: latest.paidAt || new Date().toISOString(),
          releasedAt: new Date().toISOString(),
          error: undefined,
        }),
      );
      toast.success(
        `Pagamento confirmado · vence ${formatBrDate(updated.dueDate)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao liberar";
      persistMpOrders(
        patchMpOrder(loadMpOrders(user.id), order.id, {
          status: "approved",
          error: msg,
        }),
      );
      toast.error(`Pago, mas falhou a liberação: ${msg}`);
    } finally {
      releasingRef.current.delete(order.id);
    }
  };

  const pollPendingMpOrders = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!user) return;
    if (!config.mpAccessToken.trim()) {
      if (!silent) {
        toast.error("Configure o Access Token do Mercado Pago em Automações");
      }
      return;
    }
    if (!silent) setVerifying(true);
    try {
      const loaded = loadMpOrders(user.id);
      let next = pruneStaleMpOrders(loaded);
      let changed = next.length !== loaded.length;
      let removedExpired = loaded.length - next.length;
      const pending = next.filter((o) => o.status === "pending");
      const stuckApproved = next.filter(
        (o) => o.status === "approved" && !o.releasedAt,
      );
      if (!pending.length && !stuckApproved.length) {
        if (changed) persistMpOrders(next);
        if (!silent) {
          if (removedExpired > 0) {
            toast.message(
              `${removedExpired} PIX expirado(s) removido(s) da lista`,
            );
          } else {
            toast.message("Nenhum PIX pendente para verificar");
          }
        }
        return;
      }
      const approved: MpRenewOrder[] = [...stuckApproved];
      const errors: string[] = [];
      let stillWaiting = 0;
      const now = Date.now();
      for (const order of pending) {
        if (now >= getMpOrderExpiresAt(order)) {
          changed = true;
          removedExpired += 1;
          next = next.filter((o) => o.id !== order.id);
          continue;
        }
        try {
          const st = await fetchMercadoPagoPaymentStatus({
            accessToken: config.mpAccessToken,
            paymentId: order.mpPaymentId,
          });
          // Sincroniza validade real do MP (quando o QR deixa de valer)
          if (
            st.date_of_expiration &&
            st.date_of_expiration !== order.expiresAt
          ) {
            changed = true;
            next = patchMpOrder(next, order.id, {
              expiresAt: st.date_of_expiration,
            });
          }
          const expAt = st.date_of_expiration
            ? Date.parse(st.date_of_expiration)
            : getMpOrderExpiresAt(
                next.find((o) => o.id === order.id) || order,
              );
          if (Number.isFinite(expAt) && now >= expAt) {
            changed = true;
            removedExpired += 1;
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
            removedExpired += 1;
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
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao consultar MP";
          errors.push(`${order.panelUsername || order.id}: ${msg}`);
        }
      }
      if (changed) persistMpOrders(next);
      for (const order of approved) void releasePaidOrder(order);

      if (!silent) {
        if (approved.length > 0) {
          toast.success(
            approved.length === 1
              ? "Pagamento confirmado — liberando renovação"
              : `${approved.length} pagamentos confirmados`,
          );
        } else if (errors.length > 0) {
          toast.error(errors[0]!);
        } else if (removedExpired > 0 && stillWaiting === 0) {
          toast.message(
            `${removedExpired} PIX expirado(s)/cancelado(s) removido(s)`,
          );
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
    } finally {
      if (!silent) setVerifying(false);
    }
  };

  const createAndSendPix = async () => {
    if (!user || !pixTargetId) return;
    const item = clients.find((i) => i.id === pixTargetId);
    if (!item) return;

    const existing = findPendingMpOrderForClient(loadMpOrders(user.id), {
      itemRefId: item.id,
      panelUsername: item.itemId,
    });
    if (existing) {
      setPixActiveOrderId(existing.id);
      toast.message(
        "Já existe um PIX aguardando para este usuário. Não foi gerado outro.",
      );
      return;
    }

    const amount = pixAmountFromFolderPrice(item.price, pixOption.months);
    if (!(amount >= 1)) {
      toast.error(
        "Preço do cliente na pasta inválido (mínimo R$ 1,00 por mês)",
      );
      return;
    }
    setPixBusy(true);
    try {
      // Checagem de novo (evita clique duplo / race)
      const again = findPendingMpOrderForClient(loadMpOrders(user.id), {
        itemRefId: item.id,
        panelUsername: item.itemId,
      });
      if (again) {
        setPixActiveOrderId(again.id);
        toast.message("Já existe um PIX aguardando para este usuário.");
        return;
      }

      const pix = await createMercadoPagoPix({
        accessToken: config.mpAccessToken,
        amount,
        description: `Renovação ${item.itemId || item.id} · ${pixOption.months}m`,
        payerEmail: config.mpPayerEmail,
        externalReference: `auxplus_${user.id}_${item.id}_${Date.now()}`,
      });
      const order = createMpOrder({
        mpPaymentId: String(pix.id),
        itemRefId: item.id,
        clientName: item.name,
        panelUsername: item.itemId.trim(),
        dueDate: item.dueDate,
        phone: item.phone || "",
        months: pixOption.months,
        credits: pixOption.credits,
        amount,
        pixCopyPaste: pix.qr_code,
        ticketUrl: pix.ticket_url,
        status: "pending",
        // Mesma validade do QR no Mercado Pago
        expiresAt: pix.date_of_expiration,
      });
      persistMpOrders([order, ...loadMpOrders(user.id)]);
      setPixActiveOrderId(order.id);

      const evo = await loadEvolutionPlatformConfig();
      if (!isEvolutionConfigured(evo)) {
        toast.message("PIX gerado. Configure o WhatsApp para enviar ao cliente");
        return;
      }
      const runtime = {
        apiBaseUrl: evo.apiBaseUrl,
        apiKey: evo.apiKey,
        instanceName: instanceNameForUser(
          evo.instancePrefix,
          user.id,
          user.username,
        ),
      };
      const status = await fetchEvolutionStatus(runtime);
      if (status !== "open") {
        toast.message(
          "PIX gerado. WhatsApp desconectado — envie o código manualmente",
        );
        return;
      }
      await sendEvolutionText(
        runtime,
        item.phone || "",
        buildPixWhatsappIntro(order, {
          greeting: getWhatsappGreeting(),
          dueDate: item.dueDate,
        }),
      );
      await new Promise((r) => window.setTimeout(r, 1400));
      await sendEvolutionText(
        runtime,
        item.phone || "",
        buildPixWhatsappCodeOnly(order),
        1200,
      );
      toast.success("PIX enviado no WhatsApp. Aguardando pagamento…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PIX");
    } finally {
      setPixBusy(false);
    }
  };

  const pollMpRef = useRef(() => {
    /* preenchido abaixo */
  });
  pollMpRef.current = () => {
    void pollPendingMpOrders({ silent: true });
  };

  useEffect(() => {
    if (!user || !config.mpAccessToken.trim()) return;
    const tick = () => pollMpRef.current();
    const id = window.setInterval(tick, 8000);
    tick();
    return () => window.clearInterval(id);
  }, [user?.id, config.mpAccessToken]);

  const pixItem = clients.find((i) => i.id === pixTargetId);
  const unitPrice = Number(pixItem?.price) || 0;
  const totalPix = pixAmountFromFolderPrice(unitPrice, pixOption.months);
  const active = pixActiveOrderId
    ? mpOrders.find((o) => o.id === pixActiveOrderId)
    : null;

  if (!user) return null;

  return (
    <>
      <section className="ax-surface space-y-3 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold tracking-tight">
            <QrCode className="h-4 w-4 text-primary" />
            Gerar PIX
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Busque o cliente, gere o PIX e envie no WhatsApp. Liberação só após
            o pagamento. Token em Automações → Mercado Pago.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            className="h-11 border-primary/35 bg-primary/[0.06] pl-9"
            value={mpQ}
            onChange={(e) => setMpQ(e.target.value)}
            placeholder="Buscar por nome, usuário ou telefone…"
          />
        </div>
        {mpQ.trim().length < 2 ? (
          <p className="text-xs text-muted-foreground">
            Digite ao menos 2 caracteres.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum cliente encontrado.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((item) => {
              const pendingPix = findPendingMpOrderForClient(mpOrders, {
                itemRefId: item.id,
                panelUsername: item.itemId,
              });
              return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium leading-tight">
                    {maskUser(item.itemId) !== "—"
                      ? maskUser(item.itemId)
                      : item.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {Number(item.price) > 0
                      ? maskMoney(item.price)
                      : "sem preço"}
                    {item.dueDate ? ` · ${formatBrDate(item.dueDate)}` : ""}
                    {item.phone ? ` · ${maskPhone(item.phone)}` : ""}
                    {pendingPix ? " · PIX aguardando" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={pendingPix ? "outline" : "secondary"}
                  className="h-8 px-2.5"
                  disabled={pixBusy}
                  onClick={() => openPixDialog(item.id)}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {pendingPix ? "Ver PIX" : "PIX"}
                </Button>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ax-surface space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold tracking-tight">Pedidos PIX</h2>
            <p className="text-[11px] text-muted-foreground">
              Validade = Mercado Pago · some quando o QR não puder mais ser pago
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={verifying}
            onClick={() => void pollPendingMpOrders({ silent: false })}
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {verifying ? "Verificando…" : "Verificar"}
          </Button>
        </div>
        {mpOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum PIX gerado ainda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mpOrders.slice(0, 30).map((order) => {
              const live = clientById.get(order.itemRefId);
              const note =
                (live?.name || order.clientName || "").trim() || "—";
              const due = live?.dueDate || order.dueDate || null;
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium leading-tight">{note}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Usuário: {maskUser(order.panelUsername)}
                      {due ? ` · Plano: ${formatBrDate(due)}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Gerado:{" "}
                      {order.createdAt
                        ? format(
                            new Date(order.createdAt),
                            "dd/MM/yyyy HH:mm",
                          )
                        : "—"}
                      {" · "}
                      PIX até:{" "}
                      {format(
                        new Date(getMpOrderExpiresAt(order)),
                        "dd/MM/yyyy HH:mm",
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {maskMoney(order.amount)} · {order.months}{" "}
                      {order.months === 1 ? "mês" : "meses"}
                      {order.error ? ` · ${order.error}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        order.status === "pending" &&
                          "border-primary/40 bg-primary/10 text-primary",
                        order.status === "released" &&
                          "border-success/40 bg-success/10 text-success",
                        (order.status === "rejected" ||
                          order.status === "cancelled" ||
                          order.status === "expired") &&
                          "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      {order.status === "pending"
                        ? "Aguardando PIX"
                        : order.status === "approved"
                          ? "Pago · liberando"
                          : order.status === "released"
                            ? "Liberado"
                            : order.status}
                    </Badge>
                    {order.pixCopyPaste ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => {
                          void copyText(order.pixCopyPaste);
                          toast.message("PIX copiado");
                        }}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {order.status === "approved" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={() => void releasePaidOrder(order)}
                      >
                        Liberar
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        open={!!pixTargetId}
        onOpenChange={(open) => {
          if (!open) {
            setPixTargetId(null);
            setPixActiveOrderId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PIX para renovação</DialogTitle>
            <DialogDescription>
              {pixItem
                ? `${(pixItem.name || "").trim() || "—"} · ${maskUser(pixItem.itemId)} · vence ${pixItem.dueDate ? formatBrDate(pixItem.dueDate) : "—"}`
                : "Gere o PIX e envie no WhatsApp"}
              {active?.status === "pending"
                ? " · PIX já existente (não gera outro)"
                : ""}
            </DialogDescription>
          </DialogHeader>
          {active ? (
            <div className="space-y-3 py-1">
              <p className="text-sm">
                Status:{" "}
                <span className="font-medium">
                  {active.status === "pending"
                    ? "Aguardando pagamento"
                    : active.status === "approved"
                      ? "Pago — liberando…"
                      : active.status === "released"
                        ? "Liberado"
                        : active.status}
                </span>
              </p>
              <div className="space-y-1">
                <Label className="text-xs">PIX Copia e Cola</Label>
                <textarea
                  readOnly
                  value={active.pixCopyPaste}
                  className="min-h-[88px] w-full rounded-md border bg-muted/40 px-2.5 py-2 text-[11px]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void copyText(active.pixCopyPaste);
                    toast.message("PIX copiado");
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={verifying}
                  onClick={() => void pollPendingMpOrders({ silent: false })}
                >
                  {verifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {verifying ? "Verificando…" : "Verificar pagamento"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <p className="text-[11px] text-muted-foreground">
                Valor automático: preço da pasta ({maskMoney(unitPrice)}) ×
                meses.
              </p>
              <div className="space-y-1.5">
                {IPTV_RENEW_OPTIONS.map((opt) => {
                  const selected = pixOption.months === opt.months;
                  const optTotal = pixAmountFromFolderPrice(
                    unitPrice,
                    opt.months,
                  );
                  return (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => setPixOption(opt)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition",
                        selected
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      <span>{opt.label}</span>
                      <span className="tabular-nums text-xs">
                        {maskMoney(optTotal)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm font-medium">PIX: {maskMoney(totalPix)}</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPixTargetId(null);
                setPixActiveOrderId(null);
              }}
            >
              Fechar
            </Button>
            {!pixActiveOrderId ? (
              <Button
                type="button"
                disabled={!pixTargetId || pixBusy}
                onClick={() => void createAndSendPix()}
              >
                {pixBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Gerar e enviar PIX
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
