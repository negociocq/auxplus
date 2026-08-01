import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Mail, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import {
  isValidEmail,
  sendLinkEmailConfirmation,
} from "@/lib/emailAuth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { emailTakenByOther } from "@/lib/storage";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Settings() {
  const { user, data, setData } = useApp();
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    setEmail(user?.email?.trim() || user?.pendingEmail?.trim() || "");
  }, [user?.email, user?.pendingEmail]);

  if (!user) return null;

  const confirmedEmail = user.email?.trim() || "";
  const pendingEmail = user.pendingEmail?.trim() || "";
  const missingEmail = !confirmedEmail;

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
      // Só guarda como pendente — `email` só muda após o clique no link
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
        toast.warning(
          "Não foi possível enviar o e-mail de confirmação. Tente novamente.",
        );
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração"
        description="E-mail de acesso e senha da sua conta."
      />

      <form
        onSubmit={onSaveEmail}
        className="ax-surface mx-auto max-w-lg space-y-5 p-5"
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
            O e-mail só fica salvo na conta depois que você clicar no link de
            confirmação. Até lá, o login por e-mail não funciona.
          </p>
          {confirmedEmail ? (
            <p className="text-xs text-muted-foreground">
              Confirmado: <span className="font-medium">{confirmedEmail}</span>
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
      </form>

      <form
        onSubmit={onSavePassword}
        className="ax-surface mx-auto max-w-lg space-y-5 p-5"
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
    </div>
  );
}
