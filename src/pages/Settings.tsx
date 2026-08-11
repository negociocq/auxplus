import { useEffect, useState, type FormEvent } from "react";
import { Bell, KeyRound, Loader2, LogOut, Mail, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import {
  isValidEmail,
  sendLinkEmailConfirmation,
} from "@/lib/emailAuth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { emailTakenByOther } from "@/lib/storage";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import {
  defaultNotificationSettings,
  loadNotificationSettings,
  loadNotificationSettingsRemote,
  saveNotificationSettings,
  type NotificationSettings,
} from "@/lib/notificationSettings";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/localNotifications";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  const { user, data, setData } = useApp();
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const [notif, setNotif] = useState<NotificationSettings>(() =>
    defaultNotificationSettings(),
  );
  const [savingNotif, setSavingNotif] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    () => notificationPermission(),
  );
  const [uniplayLinked, setUniplayLinked] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    setEmail(user?.email?.trim() || user?.pendingEmail?.trim() || "");
  }, [user?.email, user?.pendingEmail]);

  useEffect(() => {
    if (!user) {
      setUniplayLinked(false);
      return;
    }
    const local = loadAutomationsConfig(user.id);
    setUniplayLinked(isUniplayConnected(local));
    void loadAutomationsConfigRemote(user.id).then((cfg) => {
      setUniplayLinked(isUniplayConnected(cfg));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setNotif(loadNotificationSettings(user.id));
    void loadNotificationSettingsRemote(user.id).then(setNotif);
    setPerm(notificationPermission());
  }, [user]);

  if (!user) return null;

  const confirmedEmail = user.email?.trim() || "";
  const pendingEmail = user.pendingEmail?.trim() || "";
  const missingEmail = !confirmedEmail;

  const onSignOutAllSessions = async () => {
    setSigningOutAll(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Finalizado em todas as sessões");
      // Redireciona após um tempo curto para o login
      setTimeout(() => {
        window.location.href = "/login";
      }, 1000);
    } catch (e) {
      console.error("[Settings] Erro ao finalizar sessões:", e);
      toast.error(
        e instanceof Error
          ? e.message
          : "Erro ao finalizar todas as sessões"
      );
    } finally {
      setSigningOutAll(false);
    }
  };

  const onSaveEmail = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !isValidEmail(value)) {
      toast.error("Informe um e-mail válido");
      return;
    }
    if (emailTakenByOther(data, value, user.id)) {
      toast.error("Este e-mail já está em uso por outra conta");
      return;
    }

    if (confirmedEmail && value === confirmedEmail.toLowerCase()) {
      toast.message("Este e-mail já está confirmado na sua conta");
      return;
    }

    setSavingEmail(true);
    try {
      setData({
        ...data,
        users: data.users.map((u) =>
          u.id === user.id
            ? { ...u, pendingEmail: value, email: u.email ?? null }
            : u,
        ),
      });

      const confirmResult = await sendLinkEmailConfirmation(value, {
        username: user.username,
        appUserId: user.id,
      });
      if (confirmResult.error) {
        toast.warning(confirmResult.error);
      } else {
        toast.success(
          "Enviamos um link de confirmação. O e-mail só será vinculado depois que você clicar nele.",
        );
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const onSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (savingPwd) return;
    setSavingPwd(true);
    setPwdError("");
    try {
      const ok = await verifyPassword(current, user.password);
      if (!ok) {
        setPwdError("Senha atual incorreta.");
        return;
      }
      if (next.length < 4) {
        setPwdError("A nova senha deve ter pelo menos 4 caracteres.");
        return;
      }
      if (next !== confirm) {
        setPwdError("As senhas não coincidem.");
        return;
      }
      const hashed = await hashPassword(next);
      setData({
        ...data,
        users: data.users.map((u) =>
          u.id === user.id ? { ...u, password: hashed } : u,
        ),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Senha alterada com sucesso");
    } finally {
      setSavingPwd(false);
    }
  };

  const onAllowNotifications = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      toast.success("Notificações permitidas");
      setNotif((prev) => {
        const nextSettings = { ...prev, enabled: true };
        saveNotificationSettings(user.id, nextSettings);
        return nextSettings;
      });
    } else if (result === "denied") {
      toast.error(
        "Notificações bloqueadas neste dispositivo. Libere nas configurações do navegador/app.",
      );
    } else if (result === "unsupported") {
      toast.message("Este dispositivo não suporta notificações do navegador");
    }
  };

  const onSaveNotif = (e: FormEvent) => {
    e.preventDefault();
    setSavingNotif(true);
    try {
      const cur = loadNotificationSettings(user.id);
      const nextSettings: NotificationSettings = {
        ...notif,
        userCreditsThreshold: Math.max(
          0,
          Math.floor(Number(notif.userCreditsThreshold) || 0),
        ),
        resellerCreditsThreshold: Math.max(
          0,
          Math.floor(Number(notif.resellerCreditsThreshold) || 0),
        ),
        lastNotified: cur.lastNotified,
      };
      saveNotificationSettings(user.id, nextSettings);
      setNotif(nextSettings);
      toast.success("Preferências de notificação salvas");
    } finally {
      setSavingNotif(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração"
        description="Conta, senha e alertas do app."
      />

      <Tabs defaultValue="conta" className="mx-auto max-w-lg space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start bg-background/80">
          <TabsTrigger value="conta" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Conta
          </TabsTrigger>
          <TabsTrigger value="senha" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Senha
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Notificações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conta" className="mt-0">
          <form
            onSubmit={onSaveEmail}
            className="ax-surface space-y-5 p-5"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Settings2 className="h-4 w-4 text-primary" />
              Conta
            </div>

            {missingEmail ? (
              <div
                role="status"
                className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
              >
                {pendingEmail
                  ? `Enviamos um link para ${pendingEmail}. O e-mail só será vinculado depois que você clicar na confirmação.`
                  : "Sua conta ainda não tem e-mail vinculado. Informe um e-mail e confirme pelo link que enviaremos."}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cfg-user">Usuário</Label>
              <Input id="cfg-user" value={user.username} disabled />
              <p className="text-xs text-muted-foreground">
                O nome de usuário não pode ser alterado.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cfg-email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cfg-email"
                  type="email"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                O e-mail só fica salvo na conta depois que você clicar no link
                de confirmação. Até lá, o login por e-mail não funciona.
              </p>
              {confirmedEmail ? (
                <p className="text-xs text-muted-foreground">
                  Confirmado:{" "}
                  <span className="font-medium">{confirmedEmail}</span>
                </p>
              ) : null}
            </div>

            <Button type="submit" disabled={savingEmail}>
              {savingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingEmail
                ? "Enviando…"
                : pendingEmail && !confirmedEmail
                  ? "Reenviar confirmação"
                  : "Enviar confirmação"}
            </Button>

            <div className="border-t pt-5">
              <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="mb-3 text-sm font-medium text-amber-900 dark:text-amber-200">
                  ⚠️ Finalizar todas as sessões
                </p>
                <p className="mb-3 text-xs text-amber-800/70 dark:text-amber-300/70">
                  Isso fará logout em TODAS as sessões ativas deste navegador e
                  de outros dispositivos. Você terá que fazer login novamente.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void onSignOutAllSessions()}
                  disabled={signingOutAll}
                >
                  {signingOutAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  {signingOutAll ? "Finalizando…" : "Finalizar todas sessões"}
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="senha" className="mt-0">
          <form
            onSubmit={onSavePassword}
            className="ax-surface space-y-5 p-5"
          >
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              Senha
            </div>
            <p className="text-sm text-muted-foreground">
              Altere a senha de acesso da conta.
            </p>

            {pwdError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {pwdError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="cfg-current">Senha atual</Label>
              <Input
                id="cfg-current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-next">Nova senha</Label>
              <Input
                id="cfg-next"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cfg-confirm">Confirmar nova senha</Label>
              <Input
                id="cfg-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" disabled={savingPwd}>
              {savingPwd ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingPwd ? "Salvando…" : "Alterar senha"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="notificacoes" className="mt-0">
          <form
            onSubmit={onSaveNotif}
            className="ax-surface space-y-5 p-5"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4 text-primary" />
              Notificações
            </div>
            <p className="text-sm text-muted-foreground">
              Alertas no celular (app instalado / navegador). Funcionam com o
              AuxPlus aberto ou em segundo plano na sessão. Limites são
              ajustáveis.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onAllowNotifications()}
              >
                Permitir notificações
              </Button>
              <span className="text-xs text-muted-foreground">
                Status:{" "}
                {perm === "granted"
                  ? "permitido"
                  : perm === "denied"
                    ? "bloqueado"
                    : perm === "unsupported"
                      ? "não suportado"
                      : "ainda não pedido"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Ativar alertas</p>
                <p className="text-xs text-muted-foreground">
                  Liga ou desliga todos os lembretes abaixo.
                </p>
              </div>
              <Switch
                checked={notif.enabled}
                onCheckedChange={(v) =>
                  setNotif((p) => ({ ...p, enabled: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Atendimento WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Avisa no celular quando alguém digitar 2 (atendentes), com o
                  número do contato. Também manda um aviso no WhatsApp da
                  conta conectada.
                </p>
              </div>
              <Switch
                checked={notif.whatsappHumanEnabled !== false}
                disabled={!notif.enabled}
                onCheckedChange={(v) =>
                  setNotif((p) => ({ ...p, whatsappHumanEnabled: v }))
                }
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Vencimentos do dia</p>
                  <p className="text-xs text-muted-foreground">
                    Envia o resumo dos vencimentos de hoje no horário
                    escolhido.
                  </p>
                </div>
                <Switch
                  checked={notif.dueTodayEnabled}
                  disabled={!notif.enabled}
                  onCheckedChange={(v) =>
                    setNotif((p) => ({ ...p, dueTodayEnabled: v }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-due-time">Horário do aviso</Label>
                <Input
                  id="notif-due-time"
                  type="time"
                  disabled={!notif.enabled || !notif.dueTodayEnabled}
                  value={notif.dueTodayTime || "08:00"}
                  onChange={(e) =>
                    setNotif((p) => ({
                      ...p,
                      dueTodayTime: e.target.value || "08:00",
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Padrão 08:00. O aviso sai 1 vez por dia a partir desse horário
                  (com o app/sessão ativa).
                </p>
              </div>
            </div>

            {uniplayLinked ? (
              <>
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        Meus créditos UniPlay
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lembra quando o saldo ficar abaixo do limite.
                      </p>
                    </div>
                    <Switch
                      checked={notif.userCreditsEnabled}
                      disabled={!notif.enabled}
                      onCheckedChange={(v) =>
                        setNotif((p) => ({ ...p, userCreditsEnabled: v }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notif-user-credits">Avisar abaixo de</Label>
                    <Input
                      id="notif-user-credits"
                      type="number"
                      min={0}
                      step={1}
                      disabled={!notif.enabled || !notif.userCreditsEnabled}
                      value={notif.userCreditsThreshold}
                      onChange={(e) =>
                        setNotif((p) => ({
                          ...p,
                          userCreditsThreshold: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        Créditos dos revendedores
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lembra quando um revendedor estiver com poucos créditos.
                      </p>
                    </div>
                    <Switch
                      checked={notif.resellerCreditsEnabled}
                      disabled={!notif.enabled}
                      onCheckedChange={(v) =>
                        setNotif((p) => ({
                          ...p,
                          resellerCreditsEnabled: v,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notif-reseller-credits">
                      Avisar com até (≤)
                    </Label>
                    <Input
                      id="notif-reseller-credits"
                      type="number"
                      min={0}
                      step={1}
                      disabled={
                        !notif.enabled || !notif.resellerCreditsEnabled
                      }
                      value={notif.resellerCreditsThreshold}
                      onChange={(e) =>
                        setNotif((p) => ({
                          ...p,
                          resellerCreditsThreshold: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              </>
            ) : null}

            <Button type="submit" disabled={savingNotif}>
              {savingNotif ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingNotif ? "Salvando…" : "Salvar notificações"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
