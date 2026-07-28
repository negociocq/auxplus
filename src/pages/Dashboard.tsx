import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  FolderPlus,
  Pencil,
  Trash2,
  CalendarClock,
  Package,
  Users,
  BarChart3,
  PieChart,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import { createFolder, deleteFolder, updateFolder } from "@/lib/storage";
import type { Folder, FolderType } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function Dashboard() {
  const { user, data, setData } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<FolderType>("Cliente");
  const [password, setPassword] = useState("");

  const folders = useMemo(
    () => data.folders.filter((f) => f.userId === user?.id),
    [data.folders, user?.id],
  );

  const foldersByType = useMemo(() => {
    const map: Record<string, Folder[]> = { Cliente: [], Produto: [] };
    for (const f of folders) {
      (map[f.type] ??= []).push(f);
    }
    return map;
  }, [folders]);

  const folderStats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
    const dayAfter = format(new Date(Date.now() + 2 * 86400000), "yyyy-MM-dd");

    return folders.map((folder) => {
      const items = data.items.filter((i) => i.folderId === folder.id);
      return {
        folder,
        count: items.length,
        total: items.reduce((s, i) => s + (i.price || 0), 0),
        today: items.filter((i) => i.dueDate === today).length,
        tomorrow: items.filter((i) => i.dueDate === tomorrow).length,
        twoDays: items.filter((i) => i.dueDate === dayAfter).length,
        overdue: items.filter((i) => i.status === "Já Vencido").length,
      };
    });
  }, [folders, data.items]);

  const totals = useMemo(
    () => ({
      count: folderStats.reduce((s, f) => s + f.count, 0),
      total: folderStats.reduce((s, f) => s + f.total, 0),
    }),
    [folderStats],
  );

  // Chart data
  const barChartData = useMemo(() => {
    const typeCounts: Record<string, { name: string; value: number }> = {};
    for (const type of ["Cliente", "Produto"]) {
      const count = foldersByType[type]?.length ?? 0;
      const itemTotal = (foldersByType[type]?.length ?? 0) * 5; // placeholder
      typeCounts[type] = { name: type, value: count };
    }
    return Object.values(typeCounts);
  }, [foldersByType]);

  const pieChartData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    for (const item of data.items) {
      const status = item.status || "Sem Vencimento";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value,
    }));
  }, [data.items]);

  const lineChartData = useMemo(() => {
    const days = ["Hoje", "Amanhã", "2 dias"];
    const counts = [
      folderStats.reduce((s, f) => s + f.today, 0),
      folderStats.reduce((s, f) => s + f.tomorrow, 0),
      folderStats.reduce((s, f) => s + f.twoDays, 0),
    ];
    return days.map((name, i) => ({ name, value: counts[i] }));
  }, [folderStats]);

  const overdueCount = useMemo(
    () => folderStats.reduce((s, f) => s + f.overdue, 0),
    [folderStats],
  );

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setData(createFolder(data, user.id, name.trim(), type));
    setName("");
    setType("Cliente");
    setCreateOpen(false);
    toast.success("Pasta criada.");
  };

  const onEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editFolder || !name.trim()) return;
    setData(updateFolder(data, editFolder.id, name.trim(), type));
    setEditFolder(null);
    toast.success("Pasta atualizada.");
  };

  const onDelete = (e: FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || !user) return;
    if (password !== user.password) {
      toast.error("Senha incorreta!");
      return;
    }
    setData(deleteFolder(data, deleteTarget.id));
    setDeleteTarget(null);
    setPassword("");
    toast.success("Pasta excluída.");
  };

  const openEdit = (folder: Folder) => {
    setEditFolder(folder);
    setName(folder.name);
    setType(folder.type);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Itens</CardTitle>
            <BarChart3 className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count}</div>
            <p className="text-xs text-slate-500">
              em {folders.length} pastas
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totals.total.toFixed(2)}
            </div>
            <p className="text-xs text-slate-500">
              valor acumulado
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">
              Vencidos
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-800">{overdueCount}</div>
            <p className="text-xs text-amber-700">
              itens vencidos
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-200 bg-sky-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-sky-800">
              Ativos
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-800">
              {totals.count - overdueCount}
            </div>
            <p className="text-xs text-sky-700">
              itens ativos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Distribuição por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos Itens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <RechartsPieChart>
                <Tooltip />
                <Legend />
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </RechartsPieChart>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens por Dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Folder List Section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suas pastas</h1>
          <p className="text-sm text-slate-600">
            {totals.count} itens · R$ {totals.total.toFixed(2)}
          </p>
        </div>
        <Button
          className="bg-sky-600 hover:bg-sky-700"
          onClick={() => {
            setName("");
            setType("Cliente");
            setCreateOpen(true);
          }}
        >
          <FolderPlus className="h-4 w-4" />
          Nova pasta
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {folderStats.slice(0, 4).map((s) => (
          <Card key={s.folder.id} className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="truncate text-base">{s.folder.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                Hoje: <strong>{s.today}</strong> · Amanhã: <strong>{s.tomorrow}</strong>
              </p>
              <p>
                Em 2 dias: <strong>{s.twoDays}</strong> · Vencidos:{" "}
                <strong className="text-red-600">{s.overdue}</strong>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Folder Types Section */}
      {(["Cliente", "Produto"] as FolderType[]).map((folderType) => (
        <section key={folderType} className="space-y-3">
          <div className="flex items-center gap-2">
            {folderType === "Cliente" ? (
              <Users className="h-5 w-5 text-sky-600" />
            ) : (
              <Package className="h-5 w-5 text-emerald-600" />
            )}
            <h2 className="text-lg font-semibold">{folderType}s</h2>
            <Badge variant="secondary">
              {foldersByType[folderType]?.length ?? 0}
            </Badge>
          </div>

          {(foldersByType[folderType] ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              Nenhuma pasta de {folderType.toLowerCase()} ainda.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(foldersByType[folderType] ?? []).map((folder) => {
                const stats = folderStats.find((s) => s.folder.id === folder.id)!;
                return (
                  <Card
                    key={folder.id}
                    className="group border-slate-200 transition hover:border-sky-300 hover:shadow-md"
                  >
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div>
                        <CardTitle className="text-lg">
                          <Link
                            to={`/folders/${folder.id}`}
                            className="hover:text-sky-700 hover:underline"
                          >
                            {folder.name}
                          </Link>
                        </CardTitle>
                        <p className="mt-1 text-sm text-slate-500">
                          {stats.count} itens · R$ {stats.total.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-70 group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(folder)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => {
                            setDeleteTarget(folder);
                            setPassword("");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Link
                        to={`/folders/${folder.id}`}
                        className="text-sm font-medium text-sky-700 hover:underline"
                      >
                        Abrir pasta →
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {/* Create Folder Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onCreate}>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as FolderType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cliente">Cliente</SelectItem>
                  <SelectItem value="Produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={!!editFolder} onOpenChange={(o) => !o && setEditFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pasta</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onEdit}>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as FolderType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cliente">Cliente</SelectItem>
                  <SelectItem value="Produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-sky-600 hover:bg-sky-700">
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pasta</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onDelete}>
            <p className="text-sm text-slate-600">
              Confirme sua senha para excluir <strong>{deleteTarget?.name}</strong> e
              todos os itens.
            </p>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive">
                Excluir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}