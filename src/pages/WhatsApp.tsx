import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import {
  Link2,
  Loader2,
  ListOrdered,
  MessageSquareText,
  ChevronDown,
  Power,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  Unplug,
  Clock3,
  CheckCircle2,
  Wallet,
  Headset,
} from "lucide-react";
import { toast } from "sonner";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useApp } from "@/context/AppContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  acquireWhatsappSendLock,
  buildTodayQueue,
  canSendMore,
  defaultWhatsappAutomation,
  fetchEvolutionConnectedProfile,
  fetchEvolutionQr,
  fetchEvolutionStatus,
  loadSendLog,
  loadWhatsappSettings,
  parseLocalYmd,
  logoutEvolution,
  nextDelayMs,
  releaseWhatsappSendLock,
  saveSendLog,
  saveWhatsappSettings,
  sendEvolutionText,
  findEvolutionWebhook,
  setEvolutionWebhook,
  syncWhatsappAccountData,
  type EvolutionConnectedProfile,
  type EvolutionRuntimeConfig,
  type WaConnectionStatus,
  type WhatsappAutomationSettings,
  type WaQueueItem,
  type WaSendLog,
} from "@/lib/whatsappAutomation";
import {
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
  type EvolutionPlatformConfig,
} from "@/lib/platformApi";
import { PixRenewPanel } from "@/components/whatsapp/PixRenewPanel";
import { WhatsappBotPanel } from "@/components/whatsapp/WhatsappBotPanel";
import {
  loadWhatsappBotConfigRemote,
  registerWaInstanceMapping,
} from "@/lib/whatsappBotConfig";
import { SUPABASE_URL } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function statusLabel(status: WaConnectionStatus) {
  switch (status) {
    case "open":
      return "Conectado";
    case "qr":
      return "Escaneie o QR Code";
    case "connecting":
      return "Conectando…";
    case "error":
      return "Erro";
    default:
      return "Desconectado";
  }
}

export default function WhatsAppPage() {
  const { user, data } = useApp();
  const { phone: maskPhone } = useHideBalance();
  const [settings, setSettings] = useState<WhatsappAutomationSettings>(() =>
    defaultWhatsappAutomation(),
  );
  const [platform, setPlatform] = useState<EvolutionPlatformConfig | null>(
    null,
  );
  const [status, setStatus] = useState<WaConnectionStatus>("disconnected");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [logs, setLogs] = useState<WaSendLog[]>([]);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<
    null | "messageBefore" | "messageOnDay" | "limits"
  >(null);
  const [botEnabled, setBotEnabled] = useState(false);
  const [connectedProfile, setConnectedProfile] =
    useState<EvolutionConnectedProfile | null>(null);
  const sendingRef = useRef(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setSettings(loadWhatsappSettings(user.id));
    setLogs(loadSendLog(user.id));
    void loadEvolutionPlatformConfig().then(setPlatform);
    // Conta (nuvem): mesmas regras/log em localhost e domínio
    void syncWhatsappAccountData(user.id).then(({ settings: s, logs: l }) => {
      setSettings(s);
      setLogs(l);
    });
    void loadWhatsappBotConfigRemote(user.id).then((c) =>
      setBotEnabled(c.enabled),
    );
  }, [user]);

  // Mantém a fila alinhada com envios automáticos / outra aba / outros PCs
  useEffect(() => {
    if (!user) return;
    const sync = () => {
      void syncWhatsappAccountData(user.id).then(({ settings: s, logs: l }) => {
        setSettings(s);
        setLogs(l);
      });
    };
    const id = window.setInterval(sync, 20000);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", sync);
    };
  }, [user]);

  const runtime: EvolutionRuntimeConfig | null = useMemo(() => {
    if (!user || !platform || !isEvolutionConfigured(platform)) return null;
    return {
      apiBaseUrl: platform.apiBaseUrl,
      apiKey: platform.apiKey,
      instanceName: instanceNameForUser(
        platform.instancePrefix,
        user.id,
        user.username,
      ),
    };
  }, [platform, user]);

  const persist = useCallback(
    (next: WhatsappAutomationSettings) => {
      if (!user) return;
      setSettings(next);
      saveWhatsappSettings(user.id, next);
    },
    [user],
  );

  const myFolders = useMemo(
    () => data.folders.filter((f) => f.userId === user?.id),
    [data.folders, user?.id],
  );
  const myItems = useMemo(
    () =>
      data.items.filter((i) =>
        myFolders.some((f) => f.id === i.folderId),
      ),
    [data.items, myFolders],
  );

  const queue = useMemo(
    () => buildTodayQueue(settings, myItems, myFolders, logs),
    [settings, myItems, myFolders, logs],
  );

  const sentTodayCount = useMemo(() => {
    const day = format(new Date(), "yyyy-MM-dd");
    return logs.filter((l) => l.day === day && l.ok).length;
  }, [logs]);

  const clearTodaySent = () => {
    if (!user) return;
    const day = format(new Date(), "yyyy-MM-dd");
    const next = loadSendLog(user.id).filter((l) => !(l.day === day && l.ok));
    saveSendLog(user.id, next);
    setLogs(next);
    toast.message("Log de envios de hoje limpo — a fila pode reaparecer");
  };

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const ensureBotInbound = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!runtime || !user) return false;
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      try {
        await registerWaInstanceMapping(runtime.instanceName, user.id);
        await setEvolutionWebhook(runtime, webhookUrl);
        const found = await findEvolutionWebhook(runtime);
        const okUrl =
          !found?.url ||
          found.url.includes("evolution-webhook") ||
          found.url.includes(webhookUrl);
        if (!opts?.silent) {
          if (okUrl) {
            toast.success("Recebimento do bot ativo", {
              description:
                "Mande mensagem do celular do revendedor/cliente para este WhatsApp.",
            });
          } else {
            toast.message("Webhook registrado, confira a Evolution", {
              description: found?.url || webhookUrl,
            });
          }
        }
        return true;
      } catch (e) {
        console.warn("[whatsapp] webhook/bot inbound", e);
        if (!opts?.silent) {
          toast.error("Não deu para ativar o recebimento do bot", {
            description:
              e instanceof Error
                ? e.message
                : "A Evolution (ngrok/Docker) precisa estar no ar.",
          });
        }
        return false;
      }
    },
    [runtime, user],
  );

  const loadConnectedProfile = useCallback(async () => {
    if (!runtime) {
      setConnectedProfile(null);
      return;
    }
    try {
      const profile = await fetchEvolutionConnectedProfile(runtime);
      setConnectedProfile(profile);
    } catch {
      setConnectedProfile(null);
    }
  }, [runtime]);

  const refreshQr = useCallback(async () => {
    if (!runtime) {
      setStatus("disconnected");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.error(
        "WhatsApp ainda não foi liberado. Peça ao administrador para configurar em Admin → API.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetchEvolutionQr(runtime);
      setStatus(res.status);
      setQrBase64(res.base64 || null);
      setPairingCode(res.pairingCode || null);
      if (res.status === "open") {
        toast.success("WhatsApp vinculado");
        stopPoll();
        void loadConnectedProfile();
        void ensureBotInbound({ silent: true });
      } else {
        setConnectedProfile(null);
      }
    } catch (e) {
      setStatus("error");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.error(e instanceof Error ? e.message : "Falha ao obter QR Code");
    } finally {
      setBusy(false);
    }
  }, [runtime, loadConnectedProfile, ensureBotInbound]);

  const checkStatus = useCallback(async () => {
    if (!runtime) return;
    try {
      const st = await fetchEvolutionStatus(runtime);
      setStatus(st);
      if (st === "open") {
        setQrBase64(null);
        stopPoll();
        void loadConnectedProfile();
        void ensureBotInbound({ silent: true });
      } else {
        setConnectedProfile(null);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [runtime, loadConnectedProfile, ensureBotInbound]);

  useEffect(() => {
    if (status !== "qr" && status !== "connecting") {
      stopPoll();
      return;
    }
    stopPoll();
    pollRef.current = window.setInterval(() => {
      void checkStatus();
    }, 4000);
    return stopPoll;
  }, [status, checkStatus]);

  useEffect(() => {
    if (!runtime) return;
    void checkStatus();
  }, [runtime, checkStatus]);

  const onDisconnect = async () => {
    if (!runtime) return;
    setBusy(true);
    try {
      await logoutEvolution(runtime);
      setStatus("disconnected");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.message("WhatsApp desvinculado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setBusy(false);
    }
  };

  const appendLog = (entry: WaSendLog) => {
    if (!user) return;
    setLogs((prev) => {
      const next = [...prev, entry];
      saveSendLog(user.id, next);
      return next;
    });
  };

  const sendOne = async (item: WaQueueItem) => {
    const currentLogs = loadSendLog(user.id);
    const gate = canSendMore(settings, currentLogs);
    if (!gate.ok) {
      toast.message(gate.reason || "Limite atingido");
      return false;
    }
    if (!runtime) {
      toast.error("API do WhatsApp não configurada pelo admin");
      return false;
    }
    await sendEvolutionText(runtime, item.phone, item.message);
    appendLog({
      day: format(new Date(), "yyyy-MM-dd"),
      sentAt: new Date().toISOString(),
      phone: item.phone,
      itemId: item.itemId,
      kind: item.kind,
      ok: true,
    });
    return true;
  };

  const runOne = async (item: WaQueueItem) => {
    if (!user || sendingRef.current) return;
    if (status !== "open") {
      toast.error("Vincule o WhatsApp pelo QR Code antes de enviar");
      return;
    }
    if (!runtime) {
      toast.error("API do WhatsApp não configurada pelo admin");
      return;
    }
    if (!acquireWhatsappSendLock()) {
      toast.message("Já existe um envio em andamento");
      return;
    }

    sendingRef.current = true;
    setSendingId(item.id);
    try {
      const ok = await sendOne(item);
      if (ok) toast.success(`Enviado: ${item.name}`);
    } catch (e) {
      appendLog({
        day: format(new Date(), "yyyy-MM-dd"),
        sentAt: new Date().toISOString(),
        phone: item.phone,
        itemId: item.itemId,
        kind: item.kind,
        ok: false,
        error: e instanceof Error ? e.message : "erro",
      });
      toast.error(
        `Falha em ${item.name}: ${e instanceof Error ? e.message : "erro"}`,
      );
    } finally {
      sendingRef.current = false;
      setSendingId(null);
      releaseWhatsappSendLock();
    }
  };

  const runQueue = async () => {
    if (!user || sendingRef.current) return;
    if (status !== "open") {
      toast.error("Vincule o WhatsApp pelo QR Code antes de enviar");
      return;
    }
    if (queue.length === 0) {
      toast.message("Nenhuma mensagem na fila de hoje");
      return;
    }
    if (!acquireWhatsappSendLock()) {
      toast.message("Já existe um envio em andamento");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    let sent = 0;
    try {
      for (const item of queue) {
        const gate = canSendMore(settings, loadSendLog(user.id));
        if (!gate.ok) {
          toast.message(gate.reason || "Parado pelos limites de segurança");
          break;
        }
        try {
          const ok = await sendOne(item);
          if (ok) {
            sent += 1;
            toast.success(`Enviado: ${item.name}`);
          }
        } catch (e) {
          appendLog({
            day: format(new Date(), "yyyy-MM-dd"),
            sentAt: new Date().toISOString(),
            phone: item.phone,
            itemId: item.itemId,
            kind: item.kind,
            ok: false,
            error: e instanceof Error ? e.message : "erro",
          });
          toast.error(
            `Falha em ${item.name}: ${e instanceof Error ? e.message : "erro"}`,
          );
          break;
        }
        if (sent < queue.length) {
          await new Promise((r) => setTimeout(r, nextDelayMs(settings)));
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
      releaseWhatsappSendLock();
      if (sent > 0) toast.success(`${sent} mensagem(ns) enviada(s)`);
    }
  };

  if (!user) return null;

  const patch = <K extends keyof WhatsappAutomationSettings>(
    key: K,
    value: WhatsappAutomationSettings[K],
  ) => persist({ ...settings, [key]: value });

  const confirmRestore = () => {
    if (!restoreTarget) return;
    const d = defaultWhatsappAutomation();
    if (restoreTarget === "messageBefore") {
      persist({ ...settings, messageBefore: d.messageBefore });
      toast.success("Mensagem (antes) restaurada ao padrão");
    } else if (restoreTarget === "messageOnDay") {
      persist({ ...settings, messageOnDay: d.messageOnDay });
      toast.success("Mensagem (no dia) restaurada ao padrão");
    } else {
      persist({
        ...settings,
        minIntervalSec: d.minIntervalSec,
        jitterSec: d.jitterSec,
        maxPerHour: d.maxPerHour,
        maxPerDay: d.maxPerDay,
      });
      toast.success("Limites restaurados ao padrão");
    }
    setRestoreTarget(null);
  };

  const setAutoSend = (on: boolean) => {
    persist({ ...settings, enabled: on });
    toast.message(
      on
        ? `Autoenvio LIGADO — a partir das ${settings.sendTime}`
        : "Autoenvio DESLIGADO — nada sai sozinho",
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Vincule o número, lembretes, PIX, autoatendimento e envio com intervalos seguros."
      />

      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList className="h-auto flex-wrap bg-background/80">
          {status !== "open" ? (
            <TabsTrigger value="conexao" className="gap-1.5">
              <QrCode className="h-3.5 w-3.5" />
              Conexão
              <Badge
                variant="outline"
                className="ml-0.5 h-5 px-1.5 text-[10px]"
              >
                …
              </Badge>
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="fila" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" />
            Fila
            {queue.length > 0 ? (
              <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                {queue.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="pix" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            PIX
          </TabsTrigger>
          <TabsTrigger value="atendimento" className="gap-1.5">
            <Headset className="h-3.5 w-3.5" />
            Atendimento
            <Badge
              variant="outline"
              className={cn(
                "ml-0.5 h-5 px-1.5 text-[10px]",
                botEnabled && "border-success/40 bg-success/15 text-success",
              )}
            >
              {botEnabled ? "Auto" : "Off"}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="lembretes" className="gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5" />
            Lembretes
            <Badge
              variant="outline"
              className={cn(
                "ml-0.5 h-5 px-1.5 text-[10px]",
                settings.enabled &&
                  "border-success/40 bg-success/15 text-success",
              )}
            >
              {settings.enabled ? "Auto" : "Off"}
            </Badge>
          </TabsTrigger>
          {status === "open" ? (
            <TabsTrigger value="conexao" className="gap-1.5">
              <QrCode className="h-3.5 w-3.5" />
              Conexão
              <Badge
                variant="outline"
                className="ml-0.5 h-5 px-1.5 text-[10px] border-success/40 bg-success/15 text-success"
              >
                OK
              </Badge>
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="conexao" className="mt-0 space-y-4">
          <section className="ax-surface mx-auto max-w-xl space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                  <QrCode className="h-4 w-4 text-primary" />
                  Vincular WhatsApp
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escaneie o QR no WhatsApp do celular (Aparelhos conectados).
                </p>
              </div>
              <Badge
                variant={status === "open" ? "default" : "secondary"}
                className={cn(
                  status === "open" &&
                    "bg-success/15 text-success hover:bg-success/15",
                )}
              >
                {statusLabel(status)}
              </Badge>
            </div>

            {!runtime ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Aguardando o administrador configurar a API do WhatsApp em{" "}
                <strong className="text-foreground">Admin → API</strong>. Depois
                é só gerar o QR e escanear.
              </div>
            ) : null}

            {status === "open" ? (
              <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
                <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="font-medium">WhatsApp conectado</p>
                  {connectedProfile?.phone ? (
                    <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-foreground">
                      {maskPhone(connectedProfile.phone)}
                      {connectedProfile.profileName ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          · {connectedProfile.profileName}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Número ainda não identificado…
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Pronto para enviar lembretes e PIX com intervalo seguro.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-xl border bg-muted/30 p-4">
                {qrBase64 ? (
                  <img
                    src={qrBase64}
                    alt="QR Code WhatsApp"
                    className="max-h-56 rounded-lg bg-white p-2"
                  />
                ) : (
                  <div className="max-w-sm text-center text-sm text-muted-foreground">
                    <Link2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    Gere o QR Code e escaneie no WhatsApp do celular (Aparelhos
                    conectados).
                  </div>
                )}
              </div>
            )}

            {pairingCode ? (
              <p className="text-center text-sm text-muted-foreground">
                Código de pareamento:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {pairingCode}
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void refreshQr()}
                disabled={busy || !runtime}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Gerar / atualizar QR
              </Button>
              {status === "open" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !runtime}
                    onClick={() => {
                      setBusy(true);
                      void ensureBotInbound()
                        .finally(() => setBusy(false));
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Headset className="h-4 w-4" />
                    )}
                    Ativar recebimento do bot
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void onDisconnect()}
                    disabled={busy}
                  >
                    <Unplug className="h-4 w-4" />
                    Desconectar
                  </Button>
                </>
              ) : null}
            </div>
            {status === "open" ? (
              <p className="text-[11px] text-muted-foreground">
                O bot não depende do localhost: a Evolution avisa o Supabase.
                Confira se o Docker/ngrok da Evolution está no ar e se o WhatsApp
                do revendedor no AuxPlus é exatamente o número que está mandando
                a mensagem.
              </p>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="lembretes" className="mt-0 space-y-4">
          <section
            className={cn(
              "ax-surface flex flex-wrap items-center justify-between gap-4 p-5",
              settings.enabled
                ? "border-success/40 bg-success/5"
                : "border-border",
            )}
          >
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <Power
                  className={cn(
                    "h-4 w-4",
                    settings.enabled ? "text-success" : "text-muted-foreground",
                  )}
                />
                Autoenvio
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {settings.enabled
                  ? `Ligado — envia sozinho a partir de ${settings.sendTime} (aba aberta + WhatsApp conectado).`
                  : "Desligado — só envia se você clicar em Enviar. Nada sai sozinho."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  settings.enabled
                    ? "border-success/40 bg-success/15 text-success"
                    : "text-muted-foreground",
                )}
              >
                {settings.enabled ? "LIGADO" : "DESLIGADO"}
              </Badge>
              <Button
                type="button"
                variant={settings.enabled ? "destructive" : "default"}
                onClick={() => setAutoSend(!settings.enabled)}
              >
                <Power className="h-4 w-4" />
                {settings.enabled ? "Desligar autoenvio" : "Ligar autoenvio"}
              </Button>
            </div>
          </section>

          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
            <div className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">Proteção anti-ban</p>
                <p className="text-muted-foreground">
                  O envio respeita intervalo entre mensagens, limite por hora/dia
                  e atraso aleatório. Use um número dedicado, evite spam e não
                  envie em massa fora do horário configurado.
                </p>
              </div>
            </div>
          </div>

          <section className="ax-surface space-y-4 p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <Clock3 className="h-4 w-4 text-primary" />
                Quando enviar
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Horário e regras da fila. O autoenvio só roda se estiver{" "}
                <strong className="text-foreground">Ligado</strong> acima.
              </p>
            </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Antes do vencimento</p>
                <p className="text-xs text-muted-foreground">
                  Inclui quem vence daqui 1 até X dias (e ainda não foi avisado)
                </p>
              </div>
              <Switch
                checked={settings.sendBefore}
                onCheckedChange={(v) => patch("sendBefore", v)}
              />
            </div>
            {settings.sendBefore ? (
              <div className="space-y-2">
                <Label htmlFor="wa-days">Quantos dias antes</Label>
                <Input
                  id="wa-days"
                  type="number"
                  min={1}
                  max={30}
                  value={settings.daysBefore}
                  onChange={(e) =>
                    patch(
                      "daysBefore",
                      Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                    )
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">No dia do vencimento</p>
              <p className="text-xs text-muted-foreground">
                Envia também no dia que vence
              </p>
            </div>
            <Switch
              checked={settings.sendOnDay}
              onCheckedChange={(v) => patch("sendOnDay", v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-time">Horário do envio</Label>
            <Input
              id="wa-time"
              type="time"
              value={settings.sendTime}
              onChange={(e) => patch("sendTime", e.target.value || "09:30")}
            />
            <p className="text-xs text-muted-foreground">
              A partir deste horário o app começa a fila automaticamente.
              Se a aba estiver fechada, o envio retoma quando você abrir de
              novo (já enviados não repetem).
            </p>
          </div>

          <Separator />

          <Collapsible open={limitsOpen} onOpenChange={setLimitsOpen}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted/50"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      limitsOpen && "rotate-180",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Limites anti-ban</p>
                    <p className="text-xs text-muted-foreground">
                      {settings.minIntervalSec}s + até {settings.jitterSec}s ·{" "}
                      {settings.maxPerHour}/hora · {settings.maxPerDay}/dia
                      {!limitsOpen ? " · toque para editar" : ""}
                    </p>
                  </div>
                </button>
              </CollapsibleTrigger>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRestoreTarget("limits")}
              >
                Restaurar padrão
              </Button>
            </div>

            <CollapsibleContent className="mt-3 space-y-3">
              <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <p>
                  Só quem está na{" "}
                  <strong className="text-foreground">fila do dia</strong> recebe
                  mensagem (vence hoje e/ou daqui X dias) — não é a pasta
                  inteira.
                </p>
                <p>
                  Sugestão: intervalo{" "}
                  <strong className="text-foreground">45–60s</strong>, variação{" "}
                  <strong className="text-foreground">20–40s</strong>, máx.{" "}
                  <strong className="text-foreground">20–30/hora</strong> e{" "}
                  <strong className="text-foreground">80–120/dia</strong>.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Intervalo mínimo (seg)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={600}
                    value={settings.minIntervalSec}
                    onChange={(e) =>
                      patch(
                        "minIntervalSec",
                        Math.max(30, Number(e.target.value) || 60),
                      )
                    }
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Espera mínima entre um cliente e o próximo. Ex.: 60 = pelo
                    menos 1 minuto.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Variação aleatória (seg)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={settings.jitterSec}
                    onChange={(e) =>
                      patch(
                        "jitterSec",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Soma um tempo aleatório (0 até este valor). Com 60 + 30 ≈
                    1m a 1m30s entre envios.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Máx. por hora</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.maxPerHour}
                    onChange={(e) =>
                      patch(
                        "maxPerHour",
                        Math.max(1, Number(e.target.value) || 25),
                      )
                    }
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Máximo em 60 minutos (não são “horas”). Ex.: 25 clientes/hora.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Máx. por dia</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={settings.maxPerDay}
                    onChange={(e) =>
                      patch(
                        "maxPerDay",
                        Math.max(1, Number(e.target.value) || 100),
                      )
                    }
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Teto do dia. Ex.: 100 = para no 100º e segue amanhã.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          </section>

          <section className="ax-surface space-y-4 p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <MessageSquareText className="h-4 w-4 text-primary" />
                Mensagens
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Variáveis:{" "}
                <code className="rounded bg-muted px-1">{"{getGreeting}"}</code>{" "}
                <code className="rounded bg-muted px-1">{"{name}"}</code>{" "}
                <code className="rounded bg-muted px-1">{"{item_id}"}</code>{" "}
                <code className="rounded bg-muted px-1">{"{due_date}"}</code>
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="msg-before">
                  Mensagem — {settings.daysBefore} dia(s) antes
                </Label>
                <Textarea
                  id="msg-before"
                  rows={12}
                  value={settings.messageBefore}
                  onChange={(e) => patch("messageBefore", e.target.value)}
                  disabled={!settings.sendBefore}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRestoreTarget("messageBefore")}
                >
                  Restaurar padrão
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-day">Mensagem — no dia do vencimento</Label>
                <Textarea
                  id="msg-day"
                  rows={12}
                  value={settings.messageOnDay}
                  onChange={(e) => patch("messageOnDay", e.target.value)}
                  disabled={!settings.sendOnDay}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRestoreTarget("messageOnDay")}
                >
                  Restaurar padrão
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="fila" className="mt-0 space-y-4">
          <section className="ax-surface space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-tight">Fila de hoje</h2>
                <p className="text-sm text-muted-foreground">
                  {queue.length} pendente(s) · {sentTodayCount} já enviado(s) ·
                  horário {settings.sendTime}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sentTodayCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearTodaySent}
                  >
                    Recolocar enviados na fila
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => void runQueue()}
                  disabled={
                    sending ||
                    Boolean(sendingId) ||
                    status !== "open" ||
                    queue.length === 0
                  }
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar fila com intervalo
                </Button>
              </div>
            </div>

            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {sentTodayCount > 0
                  ? "Ninguém pendente agora — os de hoje já foram enviados (ou estão fora da regra). Use “Recolocar enviados na fila” para testar de novo."
                  : "Ninguém para avisar hoje: precisa telefone + vencer hoje ou nos próximos X dias (regra “antes do vencimento”) em pasta Cliente/Produto."}
              </p>
            ) : (
              <ul className="space-y-2">
                {queue.map((q) => {
                  const rowBusy = sending || sendingId === q.id;
                  return (
                    <li
                      key={q.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{q.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.kind === "before"
                            ? `${Math.max(
                                1,
                                differenceInCalendarDays(
                                  parseLocalYmd(q.dueDate),
                                  parseLocalYmd(
                                    format(new Date(), "yyyy-MM-dd"),
                                  ),
                                ),
                              )} dia(s) antes`
                            : "No dia"}{" "}
                          · vence {formatBrDate(q.dueDate)} ·{" "}
                          {maskPhone(q.phone)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">
                          {q.kind === "before" ? "Antecipado" : "Hoje"}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={rowBusy || status !== "open" || !runtime}
                          onClick={() => void runOne(q)}
                          title="Enviar só este lembrete"
                        >
                          {sendingId === q.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Enviar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="pix" className="mt-0 space-y-4">
          <PixRenewPanel />
        </TabsContent>

        <TabsContent value="atendimento" className="mt-0 space-y-4">
          <WhatsappBotPanel onEnabledChange={setBotEnabled} />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={restoreTarget != null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget === "limits"
                ? "Os limites anti-ban voltam aos valores padrão. Isso substitui a configuração atual."
                : "A mensagem volta ao texto padrão. O texto atual será substituído."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
