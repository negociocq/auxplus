import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import { createUser } from "@/lib/storage";

export default function Register() {
  const { user, data, setData, login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 4) {
      setError("A senha deve ter pelo menos 4 caracteres.");
      return;
    }
    const result = createUser(data, username.trim(), password);
    if (result.error) {
      setError(result.error);
      return;
    }
    setData(result.data);
    login(username.trim(), password);
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-sky-700">Criar conta</CardTitle>
          <CardDescription>Cadastre-se no AuxPlus</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700">
              Cadastrar
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-sky-700 hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
