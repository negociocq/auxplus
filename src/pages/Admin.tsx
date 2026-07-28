import { useMemo, useState, type FormEvent } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/AppContext";
import { respondTicket } from "@/lib/storage";
import type { Ticket, User } from "@/types";

export function AdminUsers() {
  const { user, data, setData } = useApp();
  const [search, setSearch] = useState("");
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const users = useMemo(() => {
    const q = search.toLowerCase();
    return data.users.filter((u) => !q || u.username.toLowerCase().includes(q));
  }, [data.users, search]);

  const toggleActive = (target: User) => {
    if (target.id === user?.id) {
      toast.error("Você não pode desativar a si mesmo.");
      return;
    }
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === target.id ? { ...u, isActive: !u.isActive } : u,
      ),
    });
    toast.success(target.isActive ? "Usuário desativado." : "Usuário ativado.");
  };

  const removeUser = (target: User) => {
    if (target.id === user?.id) {
      toast.error("Você não pode excluir a si mesmo.");
      return;
    }
    setData({
      ...data,
      users: data.users.filter((u) => u.id !== target.id),
      folders: data.folders.filter((f) => f.userId !== target.id),
      items: data.items.filter(
        (i) =>
          !data.folders.some((f) => f.userId === target.id && f.id === i.folderId),
      ),
      tickets: data.tickets.filter((t) => t.userId !== target.id),
    });
    toast.success("Usuário excluído.");
  };

  const onChangePassword = (e: FormEvent) => {
    e.preventDefault();
    if (!pwdUser || !newPassword) return;
    setData({
      ...data,
      users: data.users.map((u) =>
        u.id === pwdUser.id ? { ...u, password: newPassword } : u,
      ),
    });
    setPwdUser(null);
    setNewPassword("");
    toast.success("Senha atualizada.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar usuários</h1>
        <p className="text-sm text-slate-600">Painel administrativo do AuxPlus</p>
      </div>

      <Input
        placeholder="Buscar usuário..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pastas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    {u.isAdmin ? (
                      <Badge className="bg-violet-600">Admin</Badge>
                    ) : (
                      <Badge variant="secondary">Usuário</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge className="bg-emerald-600">Ativo</Badge>
                    ) : (
                      <Badge variant="destructive">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {data.folders.filter((f) => f.userId === u.id).length}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                      {u.isActive ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPwdUser(u);
                        setNewPassword("");
                      }}
                    >
                      Senha
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeUser(u)}
                      disabled={u.id === user?.id}
                    >
                      Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!pwdUser} onOpenChange={(o) => !o && setPwdUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha de {pwdUser?.username}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onChangePassword}>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminTickets() {
  const { data, setData } = useApp();
  const [replying, setReplying] = useState<Ticket | null>(null);
  const [response, setResponse] = useState("");

  const onReply = (e: FormEvent) => {
    e.preventDefault();
    if (!replying || !response.trim()) return;
    setData(respondTicket(data, replying.id, response.trim()));
    setReplying(null);
    setResponse("");
    toast.success("Resposta enviada.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tickets de suporte</h1>
        <p className="text-sm text-slate-600">
          {data.tickets.filter((t) => !t.response).length} pendentes
        </p>
      </div>

      <div className="space-y-3">
        {data.tickets.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
            Nenhum ticket.
          </p>
        ) : (
          data.tickets.map((ticket) => {
            const owner = data.users.find((u) => u.id === ticket.userId);
            return (
              <Card key={ticket.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span>{owner?.username ?? "Usuário removido"}</span>
                    <span className="text-xs font-normal text-slate-500">
                      {format(parseISO(ticket.createdAt), "dd/MM/yyyy HH:mm")}
                    </span>
                    {!ticket.response && (
                      <Badge className="bg-amber-500">Pendente</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p>{ticket.question}</p>
                  {ticket.response ? (
                    <div className="rounded-md bg-sky-50 p-3 text-sm">
                      <strong>Resposta:</strong> {ticket.response}
                    </div>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplying(ticket);
                      setResponse(ticket.response ?? "");
                    }}
                  >
                    {ticket.response ? "Editar resposta" : "Responder"}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!replying} onOpenChange={(o) => !o && setReplying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder ticket</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onReply}>
            <Textarea
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              required
            />
            <DialogFooter>
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
