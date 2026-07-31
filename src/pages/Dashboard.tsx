import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/context/AppContext";
import { verifyPassword } from "@/lib/password";
import {
  computeItemStatus,
  createFolder,
  deleteFolder,
  updateFolder,
} from "@/lib/storage";
import {
  annualPaymentBalance,
  sumPaymentsByMonth,
} from "@/lib/payments";
import type { Folder, FolderType, ItemStatus } from "@/types";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DueHeatmap,
  collectDueDates,
} from "@/components/dashboard/DueHeatmap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, data, setData } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<FolderType>("Cliente");
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());

  const folders = useMemo(
    () =>
      data.folders
        .filter((f) => f.userId === user?.id)
        .filter((f) => !/^Pasta recuperada\b/i.test(f.name)),
    [data.folders, user?.id],
  );

  const myItems = useMemo(() => {
    const settingsMap = new Map(
      data.folderSettings.map((s) => [
        s.folderId,
        { near: s.nearDueDays, far: s.farDueDays ?? s.nearDueDays },
      ]),
    );
    return data.items
      .filter((i) => folders.some((f) => f.id === i.folderId))
      .map((i) => {
        const th = settingsMap.get(i.folderId) ?? { near: 3, far: 3 };
        return {
          ...i,
          status: computeItemStatus(i.dueDate, th.near, th.far) as ItemStatus,
        };
      });
  }, [data.items, data.folderSettings, folders]);

  const stats = useMemo(() => {
    return Object.fromEntries(
      folders.map((folder) => {
        const items = myItems.filter((i) => i.folderId === folder.id);
        return [
          folder.id,
          {
            count: items.length,
            total: items.reduce((s, i) => s + (i.price || 0), 0),
            overdue: items.filter((i) => i.status === "Já Vencido").length,
          },
        ];
      }),
    ) as Record<string, { count: number; total: number; overdue: number }>;
  }, [folders, myItems]);

  const kpis = useMemo(() => {
    const today = startOfDay(new Date());
    const week = {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    };
    const month = { start: startOfMonth(today), end: endOfMonth(today) };

    const longe = myItems.filter((i) => i.status === "Longe de Vencer").length;
    const perto = myItems.filter((i) => i.status === "Perto de Vencer").length;
    const vencido = myItems.filter((i) => i.status === "Já Vencido").length;
    const withDue = longe + perto + vencido;
    const healthy = withDue ? Math.round((longe / withDue) * 100) : 100;
    const revenue = myItems.reduce((s, i) => s + (i.price || 0), 0);

    const dueInRange = (interval: { start: Date; end: Date }) =>
      myItems.filter((i) => {
        if (!i.dueDate) return false;
        try {
          const d = parseISO(String(i.dueDate).slice(0, 10));
          return isWithinInterval(d, interval);
        } catch {
          return false;
        }
      }).length;

    const next7 = myItems
      .filter((i) => {
        if (!i.dueDate || i.status === "Já Vencido") return false;
        try {
          const d = parseISO(String(i.dueDate).slice(0, 10));
          return isWithinInterval(d, {
            start: today,
            end: addDays(today, 7),
          });
        } catch {
          return false;
        }
      })
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 8);

    return {
      longe,
      perto,
      vencido,
      healthy,
      revenue,
      day: dueInRange({ start: today, end: today }),
      week: dueInRange(week),
      month: dueInRange(month),
      next7,
      streakDays: (() => {
        let streak = 0;
        for (let i = 0; i < 60; i++) {
          const day = addDays(today, -i);
          const hasOverdueCreated = myItems.some((item) => {
            if (item.status !== "Já Vencido" || !item.dueDate) return false;
            try {
              return (
                parseISO(String(item.dueDate).slice(0, 10)).getTime() <=
                day.getTime()
              );
            } catch {
              return false;
            }
          });
          // streak = dias consecutivos até "hoje" sem novos vencidos "do dia"
          // Simplificado: dias desde o vencimento mais recente no passado
          void hasOverdueCreated;
        }
        const overdueDates = myItems
          .filter((i) => i.status === "Já Vencido" && i.dueDate)
          .map((i) => parseISO(String(i.dueDate).slice(0, 10)).getTime());
        if (!overdueDates.length) return 30;
        const latest = Math.max(...overdueDates);
        streak = Math.max(
          0,
          Math.floor((today.getTime() - latest) / 86400000),
        );
        return streak;
      })(),
    };
  }, [myItems]);

  const statusPie = useMemo(
    () => [
      { name: "Longe", value: kpis.longe, color: "hsl(var(--success))" },
      { name: "Perto", value: kpis.perto, color: "hsl(var(--warning))" },
      { name: "Vencido", value: kpis.vencido, color: "hsl(var(--destructive))" },
    ],
    [kpis],
  );

  const chartYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const item of myItems) {
      for (const raw of [item.createdAt, item.dueDate]) {
        if (!raw) continue;
        const y = Number(String(raw).slice(0, 4));
        if (y >= 2020) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [myItems]);

  const monthlyChart = useMemo(
    () => sumPaymentsByMonth(myItems, chartYear),
    [chartYear, myItems],
  );

  const annualBalance = useMemo(
    () => annualPaymentBalance(myItems, chartYear),
    [chartYear, myItems],
  );

  const ranking = useMemo(
    () =>
      [...folders]
        .map((f) => ({
          folder: f,
          total: stats[f.id]?.total || 0,
          count: stats[f.id]?.count || 0,
          overdue: stats[f.id]?.overdue || 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
    [folders, stats],
  );

  const byType = useMemo(() => {
    const map: Record<FolderType, Folder[]> = { Cliente: [], Produto: [] };
    for (const f of folders) map[f.type].push(f);
    return map;
  }, [folders]);

  const openCreate = () => {
    setEditFolder(null);
    setName("");
    setType("Cliente");
    setFormOpen(true);
  };

  const onSaveFolder = (e: FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    if (editFolder) {
      setData(updateFolder(data, editFolder.id, name.trim(), type));
      toast.success("Pasta atualizada");
    } else {
      setData(createFolder(data, user.id, name.trim(), type));
      toast.success("Pasta criada");
    }
    setFormOpen(false);
    setName("");
    setEditFolder(null);
  };

  const onDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || !user) return;
    const ok = await verifyPassword(password, user.password);
    if (!ok) {
      setError("Senha incorreta!");
      return;
    }
    setData(deleteFolder(data, deleteTarget.id));
    setDeleteTarget(null);
    setPassword("");
    setError("");
    toast.success("Pasta excluída");
  };

  return (
    <div>
      <PageHeader
        title="Operações"
        description="Visão geral de pastas, vencimentos e valores em carteira."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova pasta
          </Button>
        }
      />

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Minhas pastas</h2>
          <p className="text-sm text-muted-foreground">
            Abra uma pasta para gerenciar itens
          </p>
        </div>
        <Tabs defaultValue="Cliente">
          <TabsList>
            <TabsTrigger value="Cliente">Clientes</TabsTrigger>
            <TabsTrigger value="Produto">Produtos</TabsTrigger>
          </TabsList>
          {(["Cliente", "Produto"] as FolderType[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              {byType[t].length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title={`Sem pastas de ${t.toLowerCase()}`}
                  description="Organize sua carteira criando uma pasta."
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {byType[t].map((folder, idx) => (
                    <motion.li
                      key={folder.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="ax-surface group flex items-center gap-3 p-4 transition hover:-translate-y-0.5"
                    >
                      <Link
                        to={`/folders/${folder.id}`}
                        className="min-w-0 flex-1"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary">{folder.type}</Badge>
                          {(stats[folder.id]?.overdue || 0) > 0 ? (
                            <Badge variant="destructive">
                              {stats[folder.id].overdue} atrasados
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate font-semibold group-hover:text-primary">
                          {folder.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {stats[folder.id]?.count || 0} itens ·{" "}
                          {formatMoney(stats[folder.id]?.total || 0)}
                        </p>
                      </Link>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => {
                            setEditFolder(folder);
                            setName(folder.name);
                            setType(folder.type);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir"
                          onClick={() => {
                            setDeleteTarget(folder);
                            setPassword("");
                            setError("");
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label="Pastas"
          value={folders.length}
          icon={FolderKanban}
          hint={`${byType.Cliente.length} clientes · ${byType.Produto.length} produtos`}
          delay={0.02}
        />
        <StatCard
          label="Itens ativos"
          value={myItems.length}
          icon={CalendarClock}
          hint={`${kpis.day} vencem hoje · ${kpis.week} na semana`}
          delay={0.06}
        />
        <StatCard
          label="Em atraso"
          value={kpis.vencido}
          icon={AlertTriangle}
          tone={kpis.vencido ? "danger" : "success"}
          hint={`${kpis.perto} perto de vencer`}
          delay={0.1}
        />
        <StatCard
          label="Carteira"
          value={formatMoney(kpis.revenue)}
          icon={TrendingUp}
          tone="success"
          hint={`Saúde ${kpis.healthy}% em dia`}
          delay={0.14}
        />
        <StatCard
          label={`Saldo anual ${chartYear}`}
          value={formatMoney(annualBalance)}
          icon={BarChart3}
          tone="default"
          hint="Soma dos valores com vencimento no ano"
          delay={0.18}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Hoje", value: kpis.day },
          { label: "Esta semana", value: kpis.week },
          { label: "Este mês", value: kpis.month },
        ].map((item) => (
          <div key={item.label} className="ax-surface flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vencimentos · {item.label}
              </p>
              <p className="mt-1 text-2xl font-bold">{item.value}</p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary/70" />
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="ax-surface p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold tracking-tight">Receita por mês</h2>
              <p className="text-sm text-muted-foreground">
                Soma dos valores com vencimento no ano
              </p>
              <p className="mt-2 text-lg font-bold tracking-tight text-primary">
                Saldo anual {chartYear}: {formatMoney(annualBalance)}
              </p>
            </div>
            <Select
              value={String(chartYear)}
              onValueChange={(v) => setChartYear(Number(v))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chartYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    color: "hsl(var(--popover-foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number, key: string) =>
                    key === "total"
                      ? [formatMoney(Number(value)), "Total"]
                      : [value, "Itens"]
                  }
                />
                <Bar
                  dataKey="total"
                  fill="hsl(var(--primary))"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ax-surface p-5">
          <h2 className="font-semibold tracking-tight">Distribuição</h2>
          <p className="mb-2 text-sm text-muted-foreground">Status dos itens</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPie}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                >
                  {statusPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxa em dia</span>
              <span className="font-semibold">{kpis.healthy}%</span>
            </div>
            <Progress value={kpis.healthy} />
            <p className="text-xs text-muted-foreground">
              Sequência sem novo atraso crítico: {kpis.streakDays} dia(s)
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="ax-surface p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold tracking-tight">
            Mapa de vencimentos
          </h2>
          <DueHeatmap dueDates={collectDueDates(myItems)} />
        </div>
        <div className="ax-surface p-5">
          <h2 className="mb-3 font-semibold tracking-tight">Próximos 7 dias</h2>
          {kpis.next7.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vencimento nos próximos 7 dias.
            </p>
          ) : (
            <ul className="space-y-2">
              {kpis.next7.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border bg-muted/40 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(item.dueDate).slice(0, 10).split("-").reverse().join("/")}{" "}
                    · {formatMoney(item.price || 0)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-6 ax-surface p-5">
        <h2 className="mb-4 font-semibold tracking-tight">
          Ranking por valor
        </h2>
        {ranking.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhuma pasta ainda"
            description="Crie sua primeira pasta para começar."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nova pasta
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {ranking.map((row, idx) => (
              <motion.div
                key={row.folder.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center gap-3"
              >
                <span className="w-6 text-sm font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Link
                      to={`/folders/${row.folder.id}`}
                      className="truncate font-medium hover:text-primary"
                    >
                      {row.folder.name}
                    </Link>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatMoney(row.total)}
                    </span>
                  </div>
                  <Progress
                    value={
                      kpis.revenue
                        ? Math.min(100, (row.total / kpis.revenue) * 100)
                        : 0
                    }
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editFolder ? "Editar pasta" : "Nova pasta"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSaveFolder}>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as FolderType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cliente">Cliente</SelectItem>
                  <SelectItem value="Produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-name">Nome</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: IPTV, Internet…"
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editFolder ? "Salvar" : "Criar pasta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pasta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirme sua senha para excluir{" "}
            <strong>{deleteTarget?.name}</strong>.
          </p>
          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
          <form className="space-y-4" onSubmit={onDelete}>
            <div className="space-y-2">
              <Label htmlFor="del-pass">Senha</Label>
              <Input
                id="del-pass"
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
