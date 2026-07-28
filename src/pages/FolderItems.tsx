import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, Search, Settings2, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/context/AppContext";
import {
  createItem,
  deleteItem,
  updateFolderSettings,
  updateItem,
} from "@/lib/storage";
import type { Item, ItemStatus } from "@/types";
import { cn } from "@/lib/utils";

const statusStyles: Record<ItemStatus, string> = {
  "Longe de Vencer": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Perto de Vencer": "bg-amber-100 text-amber-800 border-amber-200",
  "Já Vencido": "bg-red-100 text-red-800 border-red-200",
  "Sem Vencimento": "bg-slate-100 text-slate-700 border-slate-200",
};

const emptyForm = {
  itemId: "",
  name: "",
  dueDate: "",
  phone: "",
  price: "0",
  notes: "",
};

export default function FolderItems() {
  const { folderId } = useParams();
  const { user, data, setData } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "Todos">("Todos");
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nearDays, setNearDays] = useState(3);
  const [farDays, setFarDays] = useState(10);

  const folder = data.folders.find(
    (f) => f.id === folderId && f.userId === user?.id,
  );

  const settings = data.folderSettings.find((s) => s.folderId === folderId);

  const items = useMemo(() => {
    if (!folderId) return [];
    return data.items
      .filter((i) => i.folderId === folderId)
      .filter((i) => {
        if (statusFilter !== "Todos" && i.status !== statusFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          i.name.toLowerCase().includes(q) ||
          i.itemId.toLowerCase().includes(q) ||
          i.phone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [data.items, folderId, search, statusFilter]);

  if (!folder) return <Navigate to="/dashboard" replace />;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      itemId: item.itemId,
      name: item.name,
      dueDate: item.dueDate ?? "",
      phone: item.phone,
      price: String(item.price ?? 0),
      notes: item.notes ?? "",
    });
    setFormOpen(true);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      folderId: folder.id,
      itemId: form.itemId.trim(),
      name: form.name.trim(),
      dueDate: form.dueDate || null,
      phone: form.phone.trim(),
      price: Number(form.price) || 0,
      notes: form.notes.trim(),
      isActive: true,
    };
    if (editing) {
      setData(
        updateItem(data, {
          ...editing,
          ...payload,
        }),
      );
      toast.success("Item atualizado.");
    } else {
      setData(createItem(data, payload));
      toast.success("Item criado.");
    }
    setFormOpen(false);
  };

  const openSettings = () => {
    setNearDays(settings?.nearDueDays ?? 3);
    setFarDays(settings?.farDueDays ?? 10);
    setSettingsOpen(true);
  };

  const onSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    setData(updateFolderSettings(data, folder.id, nearDays, farDays));
    setSettingsOpen(false);
    toast.success("Configurações atualizadas.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">{folder.name}</h1>
          <p className="text-sm text-slate-600">
            {folder.type} · {items.length} itens listados
          </p>
        </div>
        <Button variant="outline" onClick={openSettings}>
          <Settings2 className="h-4 w-4" />
          Prazos
        </Button>
        <Button className="bg-sky-600 hover:bg-sky-700" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo item
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Buscar nome, ID ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "Todos",
                "Longe de Vencer",
                "Perto de Vencer",
                "Já Vencido",
                "Sem Vencimento",
              ] as const
            ).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className={statusFilter === s ? "bg-sky-600 hover:bg-sky-700" : ""}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-slate-500">
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.itemId}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {item.dueDate
                        ? format(parseISO(item.dueDate), "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>{item.phone || "—"}</TableCell>
                    <TableCell>R$ {(item.price || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border", statusStyles[item.status])}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs text-slate-500">
                      {item.notes || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                          Editar
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => {
                            setData(deleteItem(data, item.id));
                            toast.success("Item excluído.");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSave}>
            <div className="space-y-2">
              <Label>ID do item</Label>
              <Input
                value={form.itemId}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prazos da pasta</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSaveSettings}>
            <div className="space-y-2">
              <Label>Dias para “Perto de Vencer”</Label>
              <Input
                type="number"
                min={0}
                value={nearDays}
                onChange={(e) => setNearDays(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Referência “Longe de Vencer”</Label>
              <Input
                type="number"
                min={0}
                value={farDays}
                onChange={(e) => setFarDays(Number(e.target.value))}
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
