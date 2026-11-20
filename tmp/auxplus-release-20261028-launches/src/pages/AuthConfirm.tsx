import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { finalizeEmailConfirmation } from "@/lib/emailAuth";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function AuthConfirm() {
  const { user, setData } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Confirmando seu e-mail…");
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const result = await finalizeEmailConfirmation();
      if (cancelled) return;

      if (result.error || !result.email) {
        setStatus("error");
        setMessage(result.error || "Falha ao confirmar e-mail.");
        return;
      }

      setConfirmedEmail(result.email);

      if (result.appUserId) {
        setData((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.id === result.appUserId
              ? { ...u, email: result.email!, pendingEmail: null }
              : u,
          ),
        }));
      }

      setStatus("ok");
      setMessage("E-mail confirmado e vinculado à sua conta.");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [setData]);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6 ax-gradient-mesh">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md animate-slide-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size="lg" />
        </div>
        <div className="ax-surface space-y-4 p-6 text-center sm:p-8">
          {status === "loading" ? (
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          ) : status === "ok" ? (
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          ) : (
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
          )}
          <h1 className="text-lg font-semibold">
            {status === "loading"
              ? "Confirmando e-mail"
              : status === "ok"
                ? "E-mail confirmado"
                : "Não foi possível confirmar"}
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          {confirmedEmail ? (
            <p className="text-sm font-medium">{confirmedEmail}</p>
          ) : null}
          {status !== "loading" ? (
            <div className="flex flex-col gap-2 pt-2">
              {user ? (
                <Button type="button" onClick={() => navigate("/dashboard")}>
                  Ir para o painel
                </Button>
              ) : (
                <Button type="button" asChild>
                  <Link to="/login">Entrar</Link>
                </Button>
              )}
              {status === "error" ? (
                <Button type="button" variant="outline" asChild>
                  <Link to="/settings">Configuração</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
