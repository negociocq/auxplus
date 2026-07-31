import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function Login() {
  const { user, login, loading } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingScreen />;
  if (user) {
    return <Navigate to={user.isAdmin ? "/admin" : "/dashboard"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const err = await login(username.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate("/");
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(172 65% 42% / 0.45), transparent 40%), radial-gradient(circle at 80% 80%, hsl(36 90% 48% / 0.2), transparent 35%)",
          }}
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/60">
            AuxPlus
          </p>
          <h1 className="mt-6 max-w-md text-4xl font-bold tracking-tight">
            Controle de vencimentos com cara de produto premium.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-sidebar-foreground/70">
            Pastas, clientes, status e cobrança via WhatsApp — num fluxo
            claro e rápido.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">
          Operação diária · renovação · acompanhamento
        </p>
      </div>

      <div className="flex items-center justify-center p-6 ax-gradient-mesh">
        <div className="w-full max-w-md animate-slide-up">
          <div className="mb-8 lg:hidden">
            <p className="text-3xl font-bold tracking-tight">
              Aux<span className="text-primary">Plus</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Entre para gerenciar suas pastas
            </p>
          </div>

          <div className="ax-surface p-6 sm:p-8">
            <div className="mb-6 hidden lg:block">
              <h2 className="text-2xl font-bold tracking-tight">Entrar</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use seu usuário e senha da plataforma
              </p>
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
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="seu.usuario"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link
                to="/register"
                className="font-semibold text-primary hover:underline"
              >
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
