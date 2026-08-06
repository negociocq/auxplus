import { useMemo } from "react";
import {
  Cable,
  CheckCircle2,
  ClipboardCopy,
  Coins,
  Eye,
  EyeOff,
  ExternalLink,
  Headset,
  Link2,
  Loader2,
  MessageCircle,
  MonitorPlay,
  QrCode,
  RefreshCw,
  Save,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useEvolutionConnection } from "@/hooks/useEvolutionConnection";
import { useUniplayConnection } from "@/hooks/useUniplayConnection";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  loadAutomationsConfig,
  saveAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import { formatIptvCredits } from "@/lib/iptvPanelApi";
import { copyText } from "@/lib/iptvAutomation";
import { DEFAULT_IPTV_PANEL_URL } from "@/lib/platformApi";
import { SUPABASE_URL } from "@/integrations/supabase/client";
import type { WaConnectionStatus } from "@/lib/whatsappAutomation";

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

export default function Conexoes() {
  const { user, data } = useApp();
  const {
    hidden: hideSensitive,
    num: maskNum,
    phone: maskPhone,
  } = useHideBalance();
  const wa = useEvolutionConnection(user);
  const uni = useUniplayConnection(user);

  /** Pastas tipo Cliente — onde o sync UniPlay pode ser ligado */
  const clientFolders = useMemo(
    () =>
      data.folders.filter(
        (f) => f.userId === user?.id && f.type === "Cliente",
      ),
    [data.folders, user?.id],
  );

  if (!user) return null;

  const copyField = async (label: string, value: string) => {
    if (!value.trim()) {
      toast.error(`${label} indisponível`);
      return;
    }
    const ok = await copyText(value);
    if (ok) toast.success(`${label} copiado`);
    else toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conexões"
        description="Conecte WhatsApp, UniPlay e Mercado Pago."
      />

      <Tabs defaultValue="whatsapp" className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Escolha a integração
          </p>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-background/80 p-1">
            <TabsTrigger
              value="whatsapp"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-5 px-1.5 text-[10px]",
                    wa.status === "open" &&
                      "border-success/40 bg-success/15 text-success",
                    wa.status === "qr" || wa.status === "connecting"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "",
                  )}
                >
                  {wa.status === "open"
                    ? "OK"
                    : wa.status === "qr" || wa.status === "connecting"
                      ? "…"
                      : "Off"}
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                QR e envio
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="uniplay"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <MonitorPlay className="h-3.5 w-3.5" />
                UniPlay
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-5 px-1.5 text-[10px]",
                    uni.uniplayConnected &&
                      "border-success/40 bg-success/15 text-success",
                  )}
                >
                  {uni.uniplayConnected ? "OK" : "Off"}
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Conta IPTV
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="mercado-pago"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <QrCode className="h-3.5 w-3.5" />
                Mercado Pago
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-5 px-1.5 text-[10px]",
                    uni.mpAccessToken.trim() &&
                      "border-success/40 bg-success/15 text-success",
                  )}
                >
                  {uni.mpAccessToken.trim() ? "OK" : "Off"}
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Token para PIX
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="winbox"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Cable className="h-3.5 w-3.5" />
                Winbox
                <Badge
                  variant="outline"
                  className="ml-0.5 h-5 px-1.5 text-[10px]"
                >
                  Off
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Em breve
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="whatsapp" className="mt-0 space-y-4">
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
                variant={wa.status === "open" ? "default" : "secondary"}
                className={cn(
                  wa.status === "open" &&
                    "bg-success/15 text-success hover:bg-success/15",
                )}
              >
                {statusLabel(wa.status)}
              </Badge>
            </div>

            {!wa.runtime ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Aguardando o administrador configurar a API do WhatsApp em{" "}
                <strong className="text-foreground">Admin → API</strong>. Depois
                é só gerar o QR e escanear.
              </div>
            ) : null}

            {wa.status === "open" ? (
              <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
                <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="font-medium">WhatsApp conectado</p>
                  {wa.connectedProfile?.phone ? (
                    <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-foreground">
                      {maskPhone(wa.connectedProfile.phone)}
                      {wa.connectedProfile.profileName ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          · {wa.connectedProfile.profileName}
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
                {wa.qrBase64 ? (
                  <img
                    src={wa.qrBase64}
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

            {wa.pairingCode ? (
              <p className="text-center text-sm text-muted-foreground">
                Código de pareamento:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {wa.pairingCode}
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void wa.refreshQr()}
                disabled={wa.busy || !wa.runtime}
              >
                {wa.busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Gerar / atualizar QR
              </Button>
              {wa.status === "open" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={wa.busy || !wa.runtime}
                    onClick={() => {
                      wa.setBusy(true);
                      void wa.ensureBotInbound().finally(() => wa.setBusy(false));
                    }}
                  >
                    {wa.busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Headset className="h-4 w-4" />
                    )}
                    Ativar recebimento do bot
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void wa.onDisconnect()}
                    disabled={wa.busy}
                  >
                    <Unplug className="h-4 w-4" />
                    Desconectar
                  </Button>
                </>
              ) : null}
            </div>
            {wa.status === "open" ? (
              <p className="text-[11px] text-muted-foreground">
                O bot não depende do localhost: a Evolution avisa o Supabase.
                Confira se o Docker/ngrok da Evolution está no ar e se o WhatsApp
                do revendedor no AuxPlus é exatamente o número que está mandando
                a mensagem.
              </p>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="uniplay" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">UniPlay</p>
            <p className="text-xs text-muted-foreground">
              {uni.uniplayConnected
                ? "Conta conectada. Clientes, revendedores, testes, renovações e atendimento ficam na página UniPlay."
                : "Conecte sua conta para liberar clientes, revendedores, testes, renovações e atendimento."}
            </p>
          </div>

          {uni.uniplayConnected ? (
            <div className="ax-surface flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Coins className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Créditos UniPlay
                  </p>
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {uni.loadingCredits && uni.panelCredits == null
                      ? "…"
                      : uni.panelCredits == null
                        ? "—"
                        : maskNum(formatIptvCredits(uni.panelCredits))}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={uni.loadingCredits}
                onClick={() => void uni.refreshPanelCredits(false)}
              >
                {uni.loadingCredits ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Atualizar
              </Button>
            </div>
          ) : null}

          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Login UniPlay
                </h2>
                <p className="text-xs text-muted-foreground">
                  Usuário e senha do painel para conectar o AuxPlus.
                </p>
              </div>
              <span className="truncate text-[11px] text-muted-foreground">
                {uni.tokenInfo}
              </span>
            </div>

            <form onSubmit={uni.onSavePanel} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="iptv-user">
                    Usuário
                  </Label>
                  <Input
                    id="iptv-user"
                    name="uniplay-user"
                    type={hideSensitive ? "password" : "text"}
                    value={uni.panelUser}
                    onChange={(e) => uni.setPanelUser(e.target.value)}
                    placeholder="Login do painel"
                    className="h-9"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    readOnly={hideSensitive}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="iptv-pass">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="iptv-pass"
                      name="uniplay-pass"
                      type={
                        hideSensitive || !uni.showPass ? "password" : "text"
                      }
                      value={uni.panelPass}
                      onChange={(e) => uni.setPanelPass(e.target.value)}
                      placeholder="Senha da UniPlay"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className="h-9 pr-9"
                      readOnly={hideSensitive}
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                      onClick={() => uni.setShowPass((v) => !v)}
                      disabled={hideSensitive}
                      aria-label={uni.showPass ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {uni.showPass && !hideSensitive ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9"
                  disabled={
                    uni.refreshingToken ||
                    !uni.panelUser.trim() ||
                    !uni.panelPass
                  }
                  onClick={() => void uni.refreshTokenNow()}
                >
                  {uni.refreshingToken ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Conectar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={uni.saving}
                >
                  <Save className="h-3.5 w-3.5" />
                  {uni.saving ? "…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={uni.openPanel}
                  disabled={
                    !(uni.platform.panelUrl.trim() || DEFAULT_IPTV_PANEL_URL)
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Painel
                </Button>
                {uni.uniplayConnected ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void uni.disconnectUniplay()}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Desconectar
                  </Button>
                ) : null}
              </div>
            </form>
          </section>

          {uni.uniplayConnected ? (
            <section className="ax-surface space-y-3 p-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Pastas de sincronização
                </h2>
                <p className="text-xs text-muted-foreground">
                  Onde o AuxPlus grava clientes e revendedores vindos da UniPlay.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pasta de clientes IPTV</Label>
                <Select
                  value={uni.syncFolderId || "__none__"}
                  onValueChange={(v) => {
                    const nextId = v === "__none__" ? "" : v;
                    uni.setSyncFolderId(nextId);
                    if (!user) return;
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, syncFolderId: nextId };
                    uni.persistConfig(next);
                    toast.message(
                      nextId
                        ? "Botão Sincronizar UniPlay liberado nessa pasta"
                        : "Botão de sincronizar clientes removido",
                    );
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Escolha a pasta de clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {clientFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Libera o botão “Sincronizar UniPlay” dentro da pasta.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pasta de revendedores</Label>
                <Select
                  value={uni.syncResellersFolderId || "__none__"}
                  onValueChange={(v) => {
                    const nextId = v === "__none__" ? "" : v;
                    uni.setSyncResellersFolderId(nextId);
                    if (!user) return;
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, syncResellersFolderId: nextId };
                    uni.persistConfig(next);
                    void saveAutomationsConfigRemote(user.id, next);
                    toast.message(
                      nextId
                        ? "Pasta de revendedores vinculada"
                        : "Pasta de revendedores desvinculada",
                    );
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Escolha a pasta de revendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {clientFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Crie uma pasta Cliente (ex.: Revendedores) e vincule aqui.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs" htmlFor="reseller-credit-price">
                  Valor do crédito (R$)
                </Label>
                <Input
                  id="reseller-credit-price"
                  type="number"
                  min={0.01}
                  step="0.01"
                  className="h-9 max-w-[12rem]"
                  value={uni.resellerCreditPriceBrl}
                  onChange={(e) =>
                    uni.setResellerCreditPriceBrl(Number(e.target.value))
                  }
                  onBlur={() => {
                    if (!user) return;
                    const price = Math.max(
                      0.01,
                      Number(uni.resellerCreditPriceBrl) || 8.5,
                    );
                    uni.setResellerCreditPriceBrl(price);
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, resellerCreditPriceBrl: price };
                    uni.persistConfig(next);
                    void saveAutomationsConfigRemote(user.id, next);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Usado no WhatsApp para revendedores. Ex.: R${" "}
                  {Number(uni.resellerCreditPriceBrl || 8.5).toLocaleString(
                    "pt-BR",
                    { minimumFractionDigits: 2 },
                  )}{" "}
                  × 10 créditos ={" "}
                  {(
                    Math.max(0.01, Number(uni.resellerCreditPriceBrl) || 8.5) *
                    10
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  .
                </p>
              </div>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="mercado-pago" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">Mercado Pago</p>
            <p className="text-xs text-muted-foreground">
              Configure o token aqui. O PIX sai pelo WhatsApp. Quando o cliente
              paga, o servidor libera sozinho (mesmo com o AuxPlus fechado) —
              basta cadastrar o webhook abaixo no painel do MP.
            </p>
          </div>

          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Token da API
                </h2>
                <p className="text-xs text-muted-foreground">
                  Access Token de produção (não use a Public Key).
                </p>
              </div>
              <Badge
                variant={uni.mpAccessToken.trim() ? "default" : "outline"}
              >
                {uni.mpAccessToken.trim() ? "Configurado" : "Pendente"}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="mp-token">
                  Access Token (não use a Public Key)
                </Label>
                <div className="relative">
                  <Input
                    id="mp-token"
                    type={uni.showMpToken ? "text" : "password"}
                    value={uni.mpAccessToken}
                    onChange={(e) => uni.setMpAccessToken(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (!text) return;
                      e.preventDefault();
                      uni.setMpAccessToken(text.trim());
                    }}
                    placeholder="APP_USR-… (token longo de Produção)"
                    className="h-9 pr-9"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => uni.setShowMpToken((v) => !v)}
                    aria-label={
                      uni.showMpToken ? "Ocultar token" : "Mostrar token"
                    }
                  >
                    {uni.showMpToken ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="mp-email">
                  E-mail do pagador (API)
                </Label>
                <Input
                  id="mp-email"
                  type="email"
                  value={uni.mpPayerEmail}
                  onChange={(e) => uni.setMpPayerEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-9"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Exigido pela API do Mercado Pago na criação do PIX (pode ser o
                  seu e-mail da conta MP).
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={uni.savingMp}
                onClick={() => void uni.saveMercadoPagoConfig()}
              >
                <Save className="h-3.5 w-3.5" />
                {uni.savingMp ? "…" : "Salvar Mercado Pago"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9"
                disabled={uni.testingMp || !uni.mpAccessToken.trim()}
                onClick={() => void uni.testMercadoPagoConnection()}
              >
                {uni.testingMp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Testar token
              </Button>
            </div>
          </section>

          <section className="ax-surface space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Webhook (liberação automática)
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Com isso, o cliente paga o PIX e o sistema libera renovação /
                créditos / teste→plano + WhatsApp sem o app precisar estar aberto.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL do webhook</Label>
              <div className="flex flex-wrap gap-1.5">
                <Input
                  readOnly
                  className="h-9 font-mono text-[11px]"
                  value={`${SUPABASE_URL}/functions/v1/mp-webhook`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    void copyField(
                      "URL webhook",
                      `${SUPABASE_URL}/functions/v1/mp-webhook`,
                    );
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
              <li>
                Abra{" "}
                <a
                  className="text-primary underline underline-offset-2"
                  href="https://www.mercadopago.com.br/developers/panel/app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Mercado Pago → Suas integrações
                </a>
              </li>
              <li>Selecione o app do Access Token (Produção)</li>
              <li>Webhooks → configurar URL (cole a URL acima)</li>
              <li>
                Marque o evento{" "}
                <span className="font-medium">Order (Mercado Pago)</span>
              </li>
              <li>Salve. Faça um PIX de teste para validar</li>
            </ol>
          </section>
        </TabsContent>

        <TabsContent value="winbox" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">Winbox</p>
            <p className="text-xs text-muted-foreground">
              Integração com MikroTik para internet (PPPoE). Ainda não está
              disponível.
            </p>
          </div>
          <section className="ax-surface space-y-3 p-5">
            <div className="flex items-start gap-2">
              <Cable className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold tracking-tight">Em breve</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Liberação automática via API do RouterOS para clientes de
                  internet. Por enquanto use só UniPlay e Mercado Pago.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
