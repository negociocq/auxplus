import { Plus, Trash2, Sparkles, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WA_TEST_ACTION_LABELS,
  exampleWaTestFlow,
  emptyWaTestFlow,
  newBlankAppMenu,
  newBlankOption,
  type WaTestFlowConfig,
  type WaTestMenu,
  type WaTestMenuOption,
  type WaTestOptionAction,
} from "@/lib/waTestFlow";

type Props = {
  value: WaTestFlowConfig;
  onChange: (next: WaTestFlowConfig) => void;
};

function patchMenu(
  menu: WaTestMenu,
  patch: Partial<WaTestMenu> | ((m: WaTestMenu) => WaTestMenu),
): WaTestMenu {
  return typeof patch === "function" ? patch(menu) : { ...menu, ...patch };
}

function OptionRows({
  menu,
  onChange,
  appMenuIds,
}: {
  menu: WaTestMenu;
  onChange: (m: WaTestMenu) => void;
  appMenuIds: string[];
}) {
  const setOpt = (idx: number, patch: Partial<WaTestMenuOption>) => {
    onChange({
      ...menu,
      options: menu.options.map((o, i) =>
        i === idx ? { ...o, ...patch } : o,
      ),
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Opções do menu</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() =>
            onChange({
              ...menu,
              options: [
                ...menu.options,
                newBlankOption(String(menu.options.length + 1)),
              ],
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Opção
        </Button>
      </div>
      {menu.options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma opção. Adicione 1, 2, 3…
        </p>
      ) : (
        <ul className="space-y-2">
          {menu.options.map((opt, idx) => (
            <li
              key={`${opt.key}-${idx}`}
              className="space-y-2 rounded-md border bg-muted/20 p-2.5"
            >
              <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr_auto]">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Nº</Label>
                  <Input
                    className="h-8"
                    value={opt.key}
                    onChange={(e) => setOpt(idx, { key: e.target.value })}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Texto
                  </Label>
                  <Input
                    className="h-8"
                    value={opt.label}
                    onChange={(e) => setOpt(idx, { label: e.target.value })}
                    placeholder="TV, FunPlay…"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mt-5 h-8 w-8 text-destructive"
                  onClick={() =>
                    onChange({
                      ...menu,
                      options: menu.options.filter((_, i) => i !== idx),
                    })
                  }
                  aria-label="Remover opção"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Ação
                  </Label>
                  <Select
                    value={opt.action}
                    onValueChange={(v) =>
                      setOpt(idx, { action: v as WaTestOptionAction })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(WA_TEST_ACTION_LABELS) as WaTestOptionAction[]
                      ).map((a) => (
                        <SelectItem key={a} value={a}>
                          {WA_TEST_ACTION_LABELS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Palavras extras (vírgula)
                  </Label>
                  <Input
                    className="h-8"
                    value={opt.keywords}
                    onChange={(e) => setOpt(idx, { keywords: e.target.value })}
                    placeholder="tv, televisao"
                  />
                </div>
              </div>
              {opt.action === "ask_app" ? (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Submenu de apps
                  </Label>
                  <Select
                    value={opt.nextMenuId || ""}
                    onValueChange={(v) => setOpt(idx, { nextMenuId: v })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Escolha o submenu" />
                    </SelectTrigger>
                    <SelectContent>
                      {appMenuIds.length === 0 ? (
                        <SelectItem value="_" disabled>
                          Crie um submenu abaixo
                        </SelectItem>
                      ) : (
                        appMenuIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {id}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {opt.action === "activate_month" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Valor PIX (R$)
                    </Label>
                    <Input
                      className="h-8"
                      type="number"
                      step="0.01"
                      min="0"
                      value={opt.amountBrl ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setOpt(idx, {
                          amountBrl:
                            Number.isFinite(n) && n > 0
                              ? Math.round(n * 100) / 100
                              : undefined,
                        });
                      }}
                      placeholder="29.90"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Telas / ativações MAC
                    </Label>
                    <Input
                      className="h-8"
                      type="number"
                      step="1"
                      min="1"
                      max="10"
                      value={opt.screens ?? ""}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        setOpt(idx, {
                          screens:
                            Number.isFinite(n) && n >= 1
                              ? Math.min(10, n)
                              : undefined,
                        });
                      }}
                      placeholder="1"
                    />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuBlock({
  title,
  hint,
  menu,
  onChange,
  appMenuIds,
}: {
  title: string;
  hint?: string;
  menu: WaTestMenu;
  onChange: (m: WaTestMenu) => void;
  appMenuIds: string[];
}) {
  return (
    <section className="ax-surface space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Texto introdutório</Label>
        <Textarea
          rows={3}
          value={menu.message}
          onChange={(e) => onChange(patchMenu(menu, { message: e.target.value }))}
          placeholder="Pergunta que o cliente vê antes das opções…"
        />
        <p className="text-[10px] text-muted-foreground">
          As opções (*1*, *2*…) são montadas sozinhas a partir da lista abaixo.
          Placeholders: {"{hours}"} {"{user}"} {"{amount}"}
        </p>
      </div>
      <OptionRows menu={menu} onChange={onChange} appMenuIds={appMenuIds} />
    </section>
  );
}

export function TestFlowEditor({ value, onChange }: Props) {
  const flow = value;
  const appMenuIds = flow.appMenus.map((m) => m.id);

  const set = (patch: Partial<WaTestFlowConfig>) =>
    onChange({ ...flow, ...patch });

  const setText = (key: keyof WaTestFlowConfig["texts"], v: string) =>
    set({ texts: { ...flow.texts, [key]: v } });

  return (
    <div className="space-y-4">
      <section className="ax-surface space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Fluxo de teste (sua conta)</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Tudo abaixo é salvo só na sua conta. Contas novas começam em
              branco — use o modelo se quiser um ponto de partida.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              onClick={() => onChange(exampleWaTestFlow())}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Usar modelo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => onChange(emptyWaTestFlow())}
            >
              <Eraser className="h-3.5 w-3.5" />
              Limpar tudo
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Frase que dispara o teste</Label>
            <Input
              value={flow.triggerPhrase}
              onChange={(e) => set({ triggerPhrase: e.target.value })}
              placeholder="Ex.: Quero testar"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço 1 mês (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={flow.monthPriceBrl || ""}
              onChange={(e) =>
                set({
                  monthPriceBrl: Math.max(0, Number(e.target.value) || 0),
                })
              }
              placeholder="30"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Link login (computador)</Label>
            <Input
              value={flow.pcLoginUrl}
              onChange={(e) => set({ pcLoginUrl: e.target.value })}
              placeholder="http://…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">APK Android (celular)</Label>
            <Input
              value={flow.phoneApkUrl}
              onChange={(e) => set({ phoneApkUrl: e.target.value })}
              placeholder="http://tie-tv.com.br/uni.apk"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App iPhone (App Store)</Label>
            <Input
              value={flow.phoneIosUrl}
              onChange={(e) => set({ phoneIosUrl: e.target.value })}
              placeholder="https://apps.apple.com/…/smarters-player-lite/…"
            />
          </div>
        </div>
      </section>

      <MenuBlock
        title="1) Qual aparelho?"
        hint="Ação Celular: “Perguntar Android / iPhone”."
        menu={flow.deviceMenu}
        appMenuIds={appMenuIds}
        onChange={(deviceMenu) => set({ deviceMenu })}
      />

      <MenuBlock
        title="2) Tipo de TV"
        hint="Pode ir direto ao app (FunPlay/Prime/XCloud) ou abrir um submenu."
        menu={flow.tvMenu}
        appMenuIds={appMenuIds}
        onChange={(tvMenu) => set({ tvMenu })}
      />

      <MenuBlock
        title="2b) Celular — Android ou iPhone?"
        hint="Aparece depois que a pessoa escolhe Celular."
        menu={flow.phoneMenu}
        appMenuIds={appMenuIds}
        onChange={(phoneMenu) => set({ phoneMenu })}
      />

      <section className="ax-surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">3) Submenus de apps</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Usados quando a opção da TV tem ação “Perguntar app (submenu)”.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              set({ appMenus: [...flow.appMenus, newBlankAppMenu()] })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Submenu
          </Button>
        </div>
        {flow.appMenus.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhum submenu. Crie um (ex.: samsung, rokulg) e aponte nas opções
            da TV.
          </p>
        ) : (
          <div className="space-y-4">
            {flow.appMenus.map((am, idx) => (
              <div
                key={am.id}
                className="space-y-3 rounded-md border border-border/70 p-3"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[8rem] flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      ID (use na TV)
                    </Label>
                    <Input
                      className="h-8 font-mono text-xs"
                      value={am.id}
                      onChange={(e) => {
                        const id = e.target.value.trim() || am.id;
                        set({
                          appMenus: flow.appMenus.map((row, i) =>
                            i === idx ? { ...row, id } : row,
                          ),
                        });
                      }}
                    />
                  </div>
                  <div className="min-w-[10rem] flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Título
                    </Label>
                    <Input
                      className="h-8"
                      value={am.title}
                      onChange={(e) =>
                        set({
                          appMenus: flow.appMenus.map((row, i) =>
                            i === idx
                              ? { ...row, title: e.target.value }
                              : row,
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() =>
                      set({
                        appMenus: flow.appMenus.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Texto introdutório</Label>
                  <Textarea
                    rows={2}
                    value={am.menu.message}
                    onChange={(e) =>
                      set({
                        appMenus: flow.appMenus.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                menu: {
                                  ...row.menu,
                                  message: e.target.value,
                                },
                              }
                            : row,
                        ),
                      })
                    }
                  />
                </div>
                <OptionRows
                  menu={am.menu}
                  appMenuIds={appMenuIds}
                  onChange={(menu) =>
                    set({
                      appMenus: flow.appMenus.map((row, i) =>
                        i === idx ? { ...row, menu } : row,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ax-surface space-y-3 p-4">
        <h3 className="text-sm font-semibold">4) Mensagens de resultado</h3>
        <p className="text-[11px] text-muted-foreground">
          Placeholders: {"{user}"} {"{password}"} {"{hours}"} {"{loginUrl}"}{" "}
          {"{apk}"} {"{iosApp}"} {"{dns}"} {"{name}"} {"{mac}"} {"{app}"}{" "}
          {"{amount}"}
        </p>
        {(
          [
            ["askName", "Pedir nome (antes do teste → nota no painel)"],
            ["funReady", "FunPlay — pedir MAC"],
            ["primeReady", "Prime — pedir MAC"],
            ["xcloudReady", "XCloud — provedor/usuário/senha"],
            ["macOk", "MAC ativado — TV Box / Android / Samsung / LG"],
            ["macOkRoku", "MAC ativado — Roku (sair do app)"],
            ["macCheckIn", "Check-in se não responder após o MAC"],
            ["macInvalid", "MAC inválido"],
            ["macPrompt", "Após instalar — pedir o MAC (FunPlay/Prime)"],
            ["checkInOk", "Check-in “conseguiu assistir?” — resposta sim"],
            ["checkInNo", "Check-in “conseguiu assistir?” — resposta não"],
            ["pcReady", "Computador — link + login"],
            ["phoneReady", "Celular Android — APK + UniPlay"],
            ["phoneIosReady", "Celular iPhone — Smarters / Xtream Codes"],
            ["activatedMonth", "Intro PIX do plano (antes do pagamento)"],
            ["notConfigured", "Fluxo não configurado"],
            ["confirmInstall", "Após entregar credenciais — “conseguiu instalar?” (sim/não)"],
            ["confirmInstallOk", "Instalação confirmada (sim) — teste no ar"],
            ["confirmInstallNo", "Instalação falhou (não) — oferece ajuda"],
            ["alreadyUsed", "Já usou o teste e pediu outro"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Textarea
              rows={4}
              value={flow.texts[key]}
              onChange={(e) => setText(key, e.target.value)}
            />
          </div>
        ))}
      </section>

      <MenuBlock
        title="5) Voltou após o teste (ativar plano)"
        hint="Opções típicas: ativar 1 mês + PIX, ou atendentes."
        menu={
          flow.offerMenu.message || flow.offerMenu.options.length
            ? flow.offerMenu
            : {
                message: flow.texts.offerPlan,
                options: flow.offerMenu.options,
              }
        }
        appMenuIds={appMenuIds}
        onChange={(offerMenu) => set({ offerMenu })}
      />
    </div>
  );
}
