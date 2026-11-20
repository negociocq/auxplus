import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { BrandLogo } from "@/components/shared/BrandLogo";

export default function Login() {
  const { user, login, loading } = useApp();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingScreen />;
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const err = await login(loginId.trim(), password);
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
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, hsl(172 65% 42% / 0.5), transparent 42%), radial-gradient(circle at 85% 75%, hsl(172 50% 35% / 0.25), transparent 40%), radial-gradient(circle at 70% 20%, hsl(36 90% 48% / 0.12), transparent 30%)",
          }}
        />
        <div className="relative">
          <div className="relative mb-10 inline-flex">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-full bg-primary/25 blur-2xl"
            />
            <BrandLogo size="xl" className="relative drop-shadow-md" />
          </div>
          <h1 className="mt-2 max-w-md text-4xl font-bold tracking-tight">
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
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="relative mb-1">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-4 rounded-full bg-primary/20 blur-xl"
              />
              <BrandLogo size="lg" className="relative" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Entre para gerenciar suas pastas
            </p>
          </div>

          <div className="ax-surface p-6 sm:p-8">
            <div className="mb-6 hidden lg:block">
              <h2 className="text-2xl font-bold tracking-tight">Entrar</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Entre com usuário ou e-mail e senha
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
                <Label htmlFor="login">Usuário ou e-mail</Label>
                <Input
                  id="login"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="seu.usuario ou seu@email.com"
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
