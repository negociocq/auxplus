import { useEffect, useMemo, useRef, useState } from "react";
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
  copyText,
  createIptvJob,
  loadIptvJobs,
  patchIptvJob,
  saveIptvJobs,
} from "@/lib/iptvAutomation";
import {
  ensureIptvToken,
  findIptvUserByUsername,
  getLastIssuedIptvToken,
  IPTV_RENEW_OPTIONS,
  renewIptvUser,
  type IptvPanelCreds,
  type IptvRenewOption,
} from "@/lib/iptvPanelApi";
import {
  createMercadoPagoPix,
  fetchMercadoPagoPaymentStatus,
  mapMpStatusToOrder,
} from "@/lib/mercadoPagoApi";
import {
  buildPixWhatsappCodeOnly,
  buildPixWhatsappIntro,
  createMpOrder,
  loadMpOrders,
  loadMpOrdersRemote,
  patchMpOrder,
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

function pixAmountFromFolderPrice(
  price: number | null | undefined,
  months: number,
): number {
  const base = Number(price) || 0;
  if (base <= 0) return 0;
  return Math.round(base * Math.max(1, months) * 100) / 100;
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
  const [pixActiveOrderId, setPixActiveOrderId] = useState<string | null>(null);
  const releasingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    setMpOrders(loadMpOrders(user.id));
    void loadMpOrdersRemote(user.id).then(setMpOrders);
    void loadAutomationsConfigRemote(user.id).then(setConfig);
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
    setMpOrders(next);
    saveMpOrders(user.id, next);
  };

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
    setPixOption(IPTV_RENEW_OPTIONS[0]);
    setPixActiveOrderId(null);
    setPixTargetId(itemId);
  };

  const releasePaidOrder = async (order: MpRenewOrder) => {
    if (!user || releasingRef.current.has(order.id)) return;
    const latest = loadMpOrders(user.id).find((o) => o.id === order.id) || order;
    if (latest.status === "released") return;
    releasingRef.current.add(order.id);
    try {
      const item = clients.find((i) => i.id === order.itemRefId);
      if (!item) throw new Error("Cliente do pedido não encontrado");
      const option =
        IPTV_RENEW_OPTIONS.find((o) => o.months === order.months) || {
          months: order.months,
          credits: order.credits,
          label: `${order.months} mês(es)`,
        };

      const credsBase = await panelCreds();
      const canRenewUniplay =
        Boolean(item.itemId.trim()) && Boolean(credsBase.bearerToken.trim());
      let updated = applyRenewalToItem(item, option.months);

      if (canRenewUniplay) {
        const currentJobs = loadIptvJobs(user.id);
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
          note: `PIX pago · MP ${order.mpPaymentId}`,
        });
        let nextJobs = [job, ...currentJobs];
        saveIptvJobs(user.id, nextJobs);

        const ensured = await ensureIptvToken(credsBase);
        if (ensured.renewed) persistToken(ensured.token);
        const creds = { ...credsBase, bearerToken: ensured.token };
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
          note: `PIX liberado · ${option.label} · vence ${formatBrDate(updated.dueDate)}`,
        });
        saveIptvJobs(user.id, nextJobs);
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

  const pollPendingMpOrders = async () => {
    if (!user || !config.mpAccessToken.trim()) return;
    const current = loadMpOrders(user.id);
    const pending = current.filter((o) => o.status === "pending");
    const stuckApproved = current.filter(
      (o) => o.status === "approved" && !o.releasedAt,
    );
    if (!pending.length && !stuckApproved.length) return;
    let next = current;
    let changed = false;
    const approved: MpRenewOrder[] = [...stuckApproved];
    for (const order of pending) {
      try {
        const st = await fetchMercadoPagoPaymentStatus({
          accessToken: config.mpAccessToken,
          paymentId: order.mpPaymentId,
        });
        const mapped = mapMpStatusToOrder(st.status);
        if (mapped === "pending") continue;
        changed = true;
        next = patchMpOrder(next, order.id, {
          status: mapped === "approved" ? "approved" : mapped,
          paidAt:
            mapped === "approved" ? new Date().toISOString() : order.paidAt,
        });
        const updated = next.find((o) => o.id === order.id);
        if (updated && mapped === "approved") approved.push(updated);
      } catch {
        /* próxima rodada */
      }
    }
    if (changed) persistMpOrders(next);
    for (const order of approved) void releasePaidOrder(order);
  };

  const createAndSendPix = async () => {
    if (!user || !pixTargetId) return;
    const item = clients.find((i) => i.id === pixTargetId);
    if (!item) return;
    const amount = pixAmountFromFolderPrice(item.price, pixOption.months);
    if (!(amount >= 1)) {
      toast.error(
        "Preço do cliente na pasta inválido (mínimo R$ 1,00 por mês)",
      );
      return;
    }
    setPixBusy(true);
    try {
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
        phone: item.phone || "",
        months: pixOption.months,
        credits: pixOption.credits,
        amount,
        pixCopyPaste: pix.qr_code,
        ticketUrl: pix.ticket_url,
        status: "pending",
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
      await new Promise((r) => window.setTimeout(r, 900));
      await sendEvolutionText(
        runtime,
        item.phone || "",
        buildPixWhatsappCodeOnly(order),
        600,
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
    void pollPendingMpOrders();
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
            {filtered.map((item) => (
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
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 px-2.5"
                  disabled={pixBusy}
                  onClick={() => openPixDialog(item.id)}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  PIX
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ax-surface space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold tracking-tight">Pedidos PIX</h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => void pollPendingMpOrders()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Verificar
          </Button>
        </div>
        {mpOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum PIX gerado ainda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mpOrders.slice(0, 30).map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium leading-tight">
                    {maskUser(order.panelUsername)}
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
            ))}
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
                ? `${maskUser(pixItem.itemId)} · vence ${pixItem.dueDate ? formatBrDate(pixItem.dueDate) : "—"}`
                : "Gere o PIX e envie no WhatsApp"}
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
                  onClick={() => void pollPendingMpOrders()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Verificar pagamento
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
