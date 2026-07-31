import { useState, type FormEvent } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePassword() {
  const { user, data, setData } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      const ok = await verifyPassword(current, user.password);
      if (!ok) {
        setError("Senha atual incorreta.");
        return;
      }
      if (next.length < 4) {
        setError("A nova senha deve ter pelo menos 4 caracteres.");
        return;
      }
      if (next !== confirm) {
        setError("As senhas não coincidem.");
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
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Trocar senha"
        description="Mantenha sua conta protegida com uma senha forte."
      />
      <div className="ax-surface p-6">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {error}
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="current">Senha atual</Label>
            <Input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next">Nova senha</Label>
            <Input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
