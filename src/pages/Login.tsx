import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";

export default function Login() {
  const { user, login, loading, backend, error: bootError } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        Conectando ao Supabase...
      </div>
    );
  }

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
    <div
      className="flex min-h-screen items-center justify-center bg-cover bg-center p-4"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15,23,42,.55), rgba(15,23,42,.7)), url('/login-bg.png')",
      }}
    >
      <Card className="w-full max-w-md border-0 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-sky-700">
            AuxPlus
          </CardTitle>
          <CardDescription>
            Gestão de clientes, produtos e vencimentos
          </CardDescription>
          <p className="pt-1 text-xs text-slate-500">
            Backend: {backend === "supabase" ? "Supabase" : "local"}
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu usuário"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {(error || bootError) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {error || bootError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full bg-sky-600 hover:bg-sky-700"
              disabled={submitting}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            Não tem conta?{" "}
            <Link to="/register" className="font-medium text-sky-700 hover:underline">
              Cadastre-se
            </Link>
          </p>
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            Conta principal: <strong>tarciocq / 123456</strong> · Admin:{" "}
            <strong>admin / admin123</strong>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
