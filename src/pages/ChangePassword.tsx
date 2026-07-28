import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";

export default function ChangePassword() {
  const { user, data, setData } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (current !== user.password) {
      toast.error("Senha atual incorreta.");
      return;
    }
    if (next.length < 4) {
      toast.error("A nova senha deve ter pelo menos 4 caracteres.");
      return;
    }
    if (next !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === user.id ? { ...u, password: next } : u,
      ),
    });
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Senha alterada com sucesso.");
  };

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-sky-600 hover:bg-sky-700">
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
