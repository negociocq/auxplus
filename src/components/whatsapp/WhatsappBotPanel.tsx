import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Loader2,
  Save,
  Bot,
  UserRound,
  Power,
  Users,
  Store,
  FlaskConical,
  Headset,
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
  const [uniplayOn, setUniplayOn] = useState(() =>
    user ? isUniplayConnected(loadAutomationsConfig(user.id)) : false,
  );
  const [botTab, setBotTab] = useState("atendimento");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    void Promise.all([
      loadWhatsappBotConfigRemote(user.id),
      loadWaBotStateRemote(user.id),
      loadAutomationsConfigRemote(user.id),
    ])
      .then(([c, s, auto]) => {
        setCfg(c);
        setState(s);
        setUniplayOn(isUniplayConnected(auto));
        onEnabledChange?.(c.enabled);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recarrega ao trocar usuário
  }, [user]);

  useEffect(() => {
    if (!uniplayOn && (botTab === "revendedores" || botTab === "teste")) {
      setBotTab("atendimento");
    }
  }, [uniplayOn, botTab]);

  const pausedPhones = Object.entries(state.humanPaused)
    .filter(([, v]) => v)
    .map(([phone]) => phone);

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

  const endHuman = async (phone: string) => {
    if (!user) return;
    const next: WaBotStateStore = {
      ...state,
      humanPaused: { ...state.humanPaused, [phone]: false },
      sessions: {
        ...state.sessions,
        [phone]: {
          state: "idle",
          updatedAt: new Date().toISOString(),
        },
      },
    };
    setState(next);
    await saveWaBotStateRemote(user.id, next);
    toast.success(`Bot reativado para ${phone}`);
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
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="atendimento" className="gap-1.5">
            <Headset className="h-3.5 w-3.5" />
            Atendimento
            {pausedPhones.length > 0 ? (
              <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                {pausedPhones.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="clientes" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Clientes
          </TabsTrigger>
          {uniplayOn ? (
            <>
              <TabsTrigger value="revendedores" className="gap-1.5">
                <Store className="h-3.5 w-3.5" />
                Revendedores
              </TabsTrigger>
              <TabsTrigger value="teste" className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Teste
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>

        <TabsContent value="atendimento" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Como funciona</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {uniplayOn
                ? "Clientes e revendedores cadastrados: o bot responde. Número desconhecido: só cria teste se enviarem *teste*."
                : "Clientes cadastrados: o bot responde renovação. Revendedores e testes só com UniPlay conectada em Conexões."}{" "}
              No chat da pessoa, digite{" "}
              <span className="font-medium text-foreground">“assumir”</span>{" "}
              — o bot avisa que virou atendimento humano e fica pausado. Quando
              terminar, digite{" "}
              <span className="font-medium text-foreground">
                “{cfg.endHumanPhrase}”
              </span>{" "}
              — o bot avisa e volta a responder.
              {uniplayOn ? (
                <>
                  {" "}
                  Quem já fez o teste não consegue outro — digite{" "}
                  <span className="font-medium text-foreground">
                    “liberar teste”
                  </span>{" "}
                  nesse chat para permitir de novo.
                </>
              ) : null}
            </p>
          </section>

          <section className="ax-surface space-y-3 p-4">
            <h3 className="text-sm font-semibold">Frase para encerrar</h3>
            <div className="space-y-2">
              <Label className="text-xs">
                Encerrar atendimento (atendentes)
              </Label>
              <Input
                value={cfg.endHumanPhrase}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, endHumanPhrase: e.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                No chat:{" "}
                <span className="font-medium text-foreground">assumir</span>{" "}
                (você atende) ·{" "}
                <span className="font-medium text-foreground">
                  {cfg.endHumanPhrase || "atendimento encerrado"}
                </span>{" "}
                (bot volta) ·{" "}
                <span className="font-medium text-foreground">
                  liberar teste
                </span>{" "}
                (permite novo teste).
              </p>
            </div>
          </section>

          <section className="ax-surface space-y-3 p-4">
            <div>
              <h3 className="text-sm font-semibold">Mensagens</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Textos usados quando o contato pede nossos atendentes.
              </p>
            </div>
            <MessageFields
              cfg={cfg}
              setCfg={setCfg}
              fields={[
                ["problemHuman", "Passou para atendentes"],
                ["humanAssumed", "Você digitou assumir"],
                ["humanBusy", "Com atendentes (cliente manda msg)"],
                ["humanEnded", "Atendimento encerrado"],
                ["pixAlreadyOpen", "PIX já existe"],
                ["errorGeneric", "Erro genérico"],
              ]}
            />
          </section>

          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Com nossos atendentes</h3>
            </div>
            {pausedPhones.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum contato pausado.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pausedPhones.map((phone) => (
                  <li
                    key={phone}
                    className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">atendentes</Badge>
                      <span className="tabular-nums">{phone}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void endHuman(phone)}
                    >
                      Reativar bot
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

      <Button type="button" disabled={saving} onClick={() => void onSave()}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar ajustes
      </Button>
    </div>
  );
}
