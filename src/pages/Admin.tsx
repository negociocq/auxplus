import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, LifeBuoy, Search, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { hashPassword } from "@/lib/password";
import { respondTicket } from "@/lib/storage";
import type { Ticket, User } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AdminUsers() {
  const { user, data, setData } = useApp();
  const [search, setSearch] = useState("");
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const users = useMemo(() => {
    const q = search.toLowerCase();
    return data.users.filter((u) => !q || u.username.toLowerCase().includes(q));
  }, [data.users, search]);

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerencie acesso, status e senhas das contas."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar usuário…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="ax-surface overflow-hidden">
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
                  <Badge variant="secondary">
                    {u.isAdmin ? "Admin" : "Usuário"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "default" : "destructive"}>
                    {u.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {data.folders.filter((f) => f.userId === u.id).length}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={u.id === user?.id}
                      onClick={() => {
                        if (u.id === user?.id) return;
                        setData({
                          ...data,
                          users: data.users.map((x) =>
                            x.id === u.id
                              ? { ...x, isActive: !x.isActive }
                              : x,
                          ),
                        });
                        toast.success(
                          u.isActive ? "Usuário desativado" : "Usuário ativado",
                        );
                      }}
                    >
                      <UserCog className="h-3.5 w-3.5" />
                      {u.isActive ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPwdUser(u);
                        setNewPassword("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Senha
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={u.id === user?.id}
                      onClick={() => {
                        if (u.id === user?.id) return;
                        setData({
                          ...data,
                          users: data.users.filter((x) => x.id !== u.id),
                          folders: data.folders.filter((f) => f.userId !== u.id),
                          items: data.items.filter(
                            (i) =>
                              !data.folders.some(
                                (f) =>
                                  f.userId === u.id && f.id === i.folderId,
                              ),
                          ),
                          tickets: data.tickets.filter((t) => t.userId !== u.id),
                        });
                        toast.success("Usuário excluído");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!pwdUser} onOpenChange={(o) => !o && setPwdUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha de {pwdUser?.username}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (!pwdUser) return;
              const hashed = await hashPassword(newPassword);
              setData({
                ...data,
                users: data.users.map((x) =>
                  x.id === pwdUser.id ? { ...x, password: hashed } : x,
                ),
              });
              setPwdUser(null);
              toast.success("Senha atualizada");
            }}
          >
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
              <Button type="submit">Salvar</Button>
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

  return (
    <div>
      <PageHeader
        title="Tickets de suporte"
        description="Responda às dúvidas dos usuários."
      />

      {data.tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Nenhum ticket"
          description="Quando os usuários enviarem dúvidas, elas aparecem aqui."
        />
      ) : (
        <div className="space-y-3">
          {data.tickets.map((ticket) => {
            const owner = data.users.find((u) => u.id === ticket.userId);
            return (
              <div
                key={ticket.id}
                className={`ax-surface p-4 ${
                  ticket.response ? "border-primary/30" : ""
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-semibold">
                    {owner?.username ?? "Usuário"}
                  </p>
                  <Badge variant={ticket.response ? "default" : "secondary"}>
                    {ticket.response ? "Respondido" : "Pendente"}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="font-medium">Pergunta: </span>
                  {ticket.question}
                </p>
                {ticket.response ? (
                  <p className="mt-2 border-t pt-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Resposta:{" "}
                    </span>
                    {ticket.response}
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    setReplying(ticket);
                    setResponse(ticket.response ?? "");
                  }}
                >
                  {ticket.response ? "Editar resposta" : "Responder"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!replying}
        onOpenChange={(o) => !o && setReplying(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder ticket</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!replying) return;
              setData(respondTicket(data, replying.id, response.trim()));
              setReplying(null);
              toast.success("Resposta enviada");
            }}
          >
            <Textarea
              className="min-h-[140px]"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              required
            />
            <DialogFooter>
              <Button type="submit">Enviar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
