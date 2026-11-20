import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Loader2,
  Save,
  Bot,
  Power,
  Users,
  Store,
  FlaskConical,
  Headset,
  RotateCcw,
  Phone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { normalizeBrPhone } from "@/lib/whatsappAutomation";
import { humanConversationPhones } from "@/lib/waHumanConversations";
import {
  defaultWhatsappBotConfig,
  loadWaBotStateRemote,
  loadWhatsappBotConfigRemote,
  saveWaBotStateRemote,
  saveWhatsappBotConfigRemote,
  type WaBotStateStore,
  type WhatsappBotConfig,
} from "@/lib/whatsappBotConfig";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import { TestFlowEditor } from "@/components/whatsapp/TestFlowEditor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Props = {
  /** Notifica a página (badge da aba) quando o interruptor muda */
  onEnabledChange?: (enabled: boolean) => void;
};

type MsgKey = keyof WhatsappBotConfig["messages"];

function MessageFields({
  cfg,
  setCfg,
  fields,
}: {
  cfg: WhatsappBotConfig;
  setCfg: Dispatch<SetStateAction<WhatsappBotConfig>>;
  fields: ReadonlyArray<readonly [MsgKey, string]>;
}) {
  return (
    <>
      {fields.map(([key, label]) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Textarea
            rows={
              key === "askIntent" ||
              key === "resellerOffer" ||
              key.includes("Intro") ||
              key.startsWith("test")
                ? 5
                : 2
            }
            value={cfg.messages[key]}
            onChange={(e) =>
              setCfg((p) => ({
                ...p,
                messages: { ...p.messages, [key]: e.target.value },
              }))
            }
          />
        </div>
      ))}
    </>
  );
}

export function WhatsappBotPanel({ onEnabledChange }: Props) {
  const { user } = useApp();
  const userId = user?.id;
  const onEnabledChangeRef = useRef(onEnabledChange);
  onEnabledChangeRef.current = onEnabledChange;
  const [cfg, setCfg] = useState<WhatsappBotConfig>(() =>
    defaultWhatsappBotConfig(),
  );
  const [state, setState] = useState<WaBotStateStore>(() => ({
    sessions: {},
    humanPaused: {},
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [uniplayOn, setUniplayOn] = useState(() =>
    user ? isUniplayConnected(loadAutomationsConfig(user.id)) : false,
  );
  const [botTab, setBotTab] = useState("atendimento");
  const [stateError, setStateError] = useState("");
  const [refreshingState, setRefreshingState] = useState(false);
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;
  const humanPhones = humanConversationPhones(state, normalizeBrPhone);
  const refreshHumanState = useCallback(async () => {
    if (!userId) return;
    setRefreshingState(true);
    try {
      const next = await loadWaBotStateRemote(userId, { strict: true });
      if (currentUserIdRef.current !== userId) return;
      setState(next);
      setStateError("");
    } catch (error) {
      if (currentUserIdRef.current === userId) setStateError(error instanceof Error ? error.message : "Falha ao atualizar conversas");
    } finally {
      if (currentUserIdRef.current === userId) setRefreshingState(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { if (!document.hidden) void refreshHumanState(); };
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [userId, refreshHumanState]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      loadWhatsappBotConfigRemote(userId),
      loadWaBotStateRemote(userId, { strict: true }),
      loadAutomationsConfigRemote(userId),
    ])
      .then(([c, s, auto]) => {
        if (cancelled) return;
        setCfg(c);
        setState(s);
        setStateError("");
        setUniplayOn(isUniplayConnected(auto));
        onEnabledChangeRef.current?.(c.enabled);
      })
      .catch((error) => {
        if (!cancelled) { setStateError("Não foi possível carregar as conversas. Atualize a lista."); toast.error(error instanceof Error ? error.message : "Falha ao carregar atendimento"); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!uniplayOn && (botTab === "revendedores" || botTab === "teste")) {
      setBotTab("atendimento");
    }
  }, [uniplayOn, botTab]);

  const setAutoAtendimento = async (on: boolean) => {
    if (!user) return;
    setToggling(true);
    try {
      const next = await saveWhatsappBotConfigRemote(user.id, {
        ...cfg,
        enabled: on,
      });
      setCfg(next);
      onEnabledChange?.(next.enabled);
      toast.message(
        on
          ? "Autoatendimento LIGADO — envie do celular do cliente/revendedor para o WhatsApp conectado"
          : "Autoatendimento DESLIGADO — nada responde sozinho",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar");
    } finally {
      setToggling(false);
    }
  };

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const next = await saveWhatsappBotConfigRemote(user.id, cfg);
      setCfg(next);
      onEnabledChange?.(next.enabled);
      toast.success("Atendimento salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const resetBotConfig = async () => {
    if (!user) return;
    setResetting(true);
    try {
      // Recarregar a configuração padrão (isso vai resetar para as mensagens padrão)
      const defaultConfig = defaultWhatsappBotConfig();
      const next = await saveWhatsappBotConfigRemote(user.id, defaultConfig);
      setCfg(next);
      onEnabledChange?.(next.enabled);
      toast.success("✅ Configuração do bot resetada com sucesso!\n\nAs novas mensagens com a opção de problema e vencimento com hora já estão ativas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao resetar configuração");
    } finally {
      setResetting(false);
    }
  };

  const removePaused = async (phone: string) => {
    if (!user) return;
    try {
      const next = await loadWaBotStateRemote(user.id, { strict: true });
      for (const key of Object.keys(next.humanPaused)) {
        if (normalizeBrPhone(key) === normalizeBrPhone(phone)) delete next.humanPaused[key];
      }
      for (const [key, session] of Object.entries(next.sessions)) {
        if (normalizeBrPhone(key) === normalizeBrPhone(phone) && session.state === "human") {
          next.sessions[key] = { ...session, state: "idle", updatedAt: new Date().toISOString() };
        }
      }
      await saveWaBotStateRemote(user.id, next);
      setState(next);
      setStateError("");
      toast.success(`Bot reativado para ${phone}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reativar");
    }
  };

  const removeAllPaused = async () => {
    if (!user) return;
    try {
      const next = await loadWaBotStateRemote(user.id, { strict: true });
      const count = humanConversationPhones(next, normalizeBrPhone).length;
      next.humanPaused = {};
      for (const [key, session] of Object.entries(next.sessions)) {
        if (session.state === "human") next.sessions[key] = { ...session, state: "idle", updatedAt: new Date().toISOString() };
      }
      await saveWaBotStateRemote(user.id, next);
      setState(next);
      setStateError("");
      toast.success(`Todos os bots reativados (${count} telefone(s))`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reativar");
    }
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando atendimento…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section
        className={cn(
          "ax-surface flex flex-wrap items-center justify-between gap-4 p-5",
          cfg.enabled ? "border-success/40 bg-success/5" : "border-border",
        )}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold tracking-tight">
            <Power
              className={cn(
                "h-4 w-4",
                cfg.enabled ? "text-success" : "text-muted-foreground",
              )}
            />
            Autoatendimento
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {cfg.enabled
              ? uniplayOn
                ? "Ligado — renovação, revendedores e testes (UniPlay ativa)."
                : "Ligado — renovação de clientes. Revendedores/testes exigem UniPlay."
              : "Desligado — o bot não responde. Só você atende no WhatsApp."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              cfg.enabled
                ? "border-success/40 bg-success/15 text-success"
                : "text-muted-foreground",
            )}
          >
            {cfg.enabled ? "LIGADO" : "DESLIGADO"}
          </Badge>
          <Button
            type="button"
            variant={cfg.enabled ? "destructive" : "default"}
            disabled={toggling}
            onClick={() => void setAutoAtendimento(!cfg.enabled)}
          >
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            {cfg.enabled ? "Desligar autoatendimento" : "Ligar autoatendimento"}
          </Button>
        </div>
      </section>

      <Tabs
        value={botTab}
        onValueChange={setBotTab}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:flex sm:flex-wrap sm:justify-start">
          <TabsTrigger value="atendimento" className="gap-1.5">
            <Headset className="h-3.5 w-3.5" />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="clientes" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Renovação de clientes
          </TabsTrigger>
          {uniplayOn ? (
            <>
              <TabsTrigger value="revendedores" className="gap-1.5">
                <Store className="h-3.5 w-3.5" />
                Revendedores
              </TabsTrigger>
              <TabsTrigger value="teste" className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Testes e planos
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>

        <TabsContent value="atendimento" className="mt-0 space-y-4">
          <section className="space-y-4 rounded-xl border bg-muted/20 p-5">
            <div>
              <h3 className="font-semibold">Por onde começar</h3>
              <p className="mt-1 text-sm text-muted-foreground">Escolha o que deseja configurar. Todas as alterações desta tela são da sua loja.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Button variant="outline" type="button" onClick={() => setBotTab("clientes")} className="block h-auto whitespace-normal rounded-lg bg-background p-4 text-left hover:border-primary">
                <Users className="mb-3 h-5 w-5 text-primary" />
                <span className="block text-sm font-semibold">Renovação de clientes</span>
                <span className="mt-1 block text-xs text-muted-foreground">Edite o menu e as mensagens de renovação e Pix.</span>
              </Button>
              {uniplayOn ? <>
                <Button variant="outline" type="button" onClick={() => setBotTab("teste")} className="block h-auto whitespace-normal rounded-lg bg-background p-4 text-left hover:border-primary">
                  <FlaskConical className="mb-3 h-5 w-5 text-primary" />
                  <span className="block text-sm font-semibold">Testes, planos e preços</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Configure aparelhos, mensagens e valores do Pix.</span>
                </Button>
                <Button variant="outline" type="button" onClick={() => setBotTab("revendedores")} className="block h-auto whitespace-normal rounded-lg bg-background p-4 text-left hover:border-primary">
                  <Store className="mb-3 h-5 w-5 text-primary" />
                  <span className="block text-sm font-semibold">Revendedores</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Personalize a oferta de créditos e a mensagem de Pix.</span>
                </Button>
              </> : null}
            </div>
          </section>
          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Como funciona</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {uniplayOn
                ? "Clientes e revendedores cadastrados: o bot responde. Número desconhecido: só cria teste se enviarem *teste*."
                : "Clientes cadastrados: o bot responde renovação. Revendedores e testes só com UniPlay conectada em Conexões."}
            </p>
          </section>

          <Accordion type="single" collapsible className="ax-surface px-4">
            <AccordionItem value="advanced" className="border-0">
              <AccordionTrigger>Mensagens gerais e restauração</AccordionTrigger>
              <AccordionContent className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Mensagens do sistema</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Textos usados no autoatendimento.
              </p>
            </div>
            <MessageFields
              cfg={cfg}
              setCfg={setCfg}
              fields={[
                ["pixAlreadyOpen", "PIX já existe"],
                ["errorGeneric", "Erro genérico"],
              ]}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resetting}
              onClick={() => void resetBotConfig()}
              className="w-full gap-2"
            >
              {resetting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Redefinir Configuração do Bot
            </Button>
            <p className="text-xs text-muted-foreground">Atenção: redefinir substitui a configuração atual pelo modelo padrão, incluindo as mensagens personalizadas.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Conversas com atendimento humano <span className="text-muted-foreground">({humanPhones.length})</span></h3>
              <Button type="button" variant="outline" size="sm" disabled={refreshingState} onClick={() => void refreshHumanState()}><RotateCcw className={`h-3.5 w-3.5 ${refreshingState ? "animate-spin" : ""}`} />Atualizar lista</Button>
              {humanPhones.length > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void removeAllPaused()}
                >
                  Retornar Todos
                </Button>
              )}
            </div>
            {stateError ? <p role="alert" className="text-sm text-destructive">{stateError}</p> : humanPhones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum telefone em atendimento humano.
              </p>
            ) : (
              <ul className="space-y-2">
                {humanPhones.map((phone) => (
                  <li
                    key={phone}
                    className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="h-3.5 w-3.5 text-warning shrink-0" />
                      <div className="min-w-0"><span className="block truncate text-sm">{phone}</span><span className="text-xs text-muted-foreground">Bot pausado até retornar ao automático</span></div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => void removePaused(phone)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retornar Bot
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="clientes" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div>
              <h3 className="text-sm font-semibold">Mensagens do cliente</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Placeholders: {"{user}"} {"{due}"} {"{renewLabel}"}{" "}
                {"{renewKind}"} {"{months}"} {"{monthsLabel}"} {"{amount}"}.
                Com vencimento em dia, {"{renewLabel}"} vira *Estender
                vencimento*; se já venceu, *Renovar*. A nota do cliente não é
                enviada.
              </p>
              <p className="mt-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                Vencimento atual: {"{due}"} {"{dueTime}"}. Após o pagamento: {"{newDue}"} {"{newDueTime}"}. A hora depende do vencimento registrado no cliente; quando ausente, a mensagem informa isso.
              </p>
            </div>
            <MessageFields
              cfg={cfg}
              setCfg={setCfg}
              fields={[
                ["askIntent", "Menu (usuário + vencimento)"],
                ["renewCreatingPix", "Gerando PIX"],
                ["renewPixIntro", "Intro PIX"],
              ]}
            />
          </section>
        </TabsContent>

        {uniplayOn ? (
          <>
            <TabsContent value="revendedores" className="mt-0 space-y-4">
              <section className="ax-surface space-y-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    Mensagens do revendedor
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Placeholders: {"{user}"} {"{credits}"} {"{amount}"}.
                  </p>
                </div>
                <MessageFields
                  cfg={cfg}
                  setCfg={setCfg}
                  fields={[
                    ["resellerOffer", "Menu créditos"],
                    ["resellerPixIntro", "Intro PIX"],
                  ]}
                />
              </section>
            </TabsContent>

            <TabsContent value="teste" className="mt-0 space-y-4">
              <TestFlowEditor
                value={cfg.testFlow}
                onChange={(testFlow) =>
                  setCfg((p) => ({
                    ...p,
                    testFlow,
                    testTriggerPhrase: testFlow.triggerPhrase,
                    testPcLoginUrl: testFlow.pcLoginUrl,
                    testPhoneApkUrl: testFlow.phoneApkUrl,
                    testPhoneIosUrl: testFlow.phoneIosUrl,
                    testMonthPriceBrl: testFlow.monthPriceBrl,
                  }))
                }
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">Depois de editar, salve para aplicar as configurações da sua loja.</p>
      <Button type="button" className="w-full sm:w-auto" disabled={saving} onClick={() => void onSave()}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar ajustes
      </Button>
      </div>
    </div>
  );
}
