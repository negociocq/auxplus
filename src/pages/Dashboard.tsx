import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
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
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Coins,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
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
  getRecordedPayments,
  sumPaymentsByMonth,
  sumRecordedPaymentsByMonth,
} from "@/lib/payments";
import { sumResellerCreditsValueByItems } from "@/lib/resellerCredits";
import {
  annualDebtPaid,
  debtSummary,
  getDebtPlan,
  sumDebtPaidByMonth,
} from "@/lib/debts";
import type { Folder, FolderType, ItemStatus } from "@/types";
import { isExpenseFolderType, isRevenueFolderType } from "@/types";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import {
  ensureIptvToken,
  fetchIptvPanelCredits,
  formatIptvCredits,
  listIptvResellers,
  type IptvPanelCreds,
} from "@/lib/iptvPanelApi";
import {
  buildResellerMovementLogs,
  sumMovementsByMonth,
} from "@/lib/iptvAutomation";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import { onUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
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
  const { money, num, text, hidden } = useHideBalance();
  const [name, setName] = useState("");
  const [type, setType] = useState<FolderType>("Cliente");
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [chartFolderId, setChartFolderId] = useState<string>("all");
  const [workspace, setWorkspace] = useState<FolderType>("Cliente");
  const isDebtWorkspace = workspace === "Dívida";
  const [uniplayCredits, setUniplayCredits] = useState<number | null>(null);
  const [uniplayConnected, setUniplayConnected] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [resellersFolderId, setResellersFolderId] = useState("");
  const [resellerCreditPriceBrl, setResellerCreditPriceBrl] = useState(8.5);
  const [resellerMovesByMonth, setResellerMovesByMonth] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (!user) {
      setUniplayCredits(null);
      setUniplayConnected(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const cfg = await loadAutomationsConfigRemote(user.id).catch(() =>
          loadAutomationsConfig(user.id),
        );
        // Sem UniPlay conectada → não busca nem mostra créditos
        if (!cancelled) {
          setResellersFolderId(cfg.syncResellersFolderId || "");
          setResellerCreditPriceBrl(cfg.resellerCreditPriceBrl || 8.5);
        }
        if (!isUniplayConnected(cfg)) {
          if (!cancelled) {
            setUniplayCredits(null);
            setUniplayConnected(false);
            setLoadingCredits(false);
          }
          return;
        }
        const bearer = cfg.iptvBearerToken?.trim() || "";
        if (!cancelled) setLoadingCredits(true);
        const plat = await loadIptvPlatformConfig();
        const ensured = await ensureIptvToken({
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: bearer,
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        const bal = await fetchIptvPanelCredits({
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: ensured.token,
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        if (!cancelled) {
          setUniplayCredits(bal.credits);
          setUniplayConnected(true);
        }
      } catch {
        if (!cancelled) {
          setUniplayCredits(null);
          setUniplayConnected(false);
        }
      } finally {
        if (!cancelled) setLoadingCredits(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 120_000);
    const offCredits = onUniplayCreditsChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      offCredits();
    };
  }, [user]);

  // Movimentações de revendedores → Receita por mês (sem depender de sincronizar)
  useEffect(() => {
    if (!user || !resellersFolderId || !uniplayConnected) return;
    let cancelled = false;
    const run = async () => {
      try {
        const cfg = await loadAutomationsConfigRemote(user.id).catch(() =>
          loadAutomationsConfig(user.id),
        );
        const plat = await loadIptvPlatformConfig();
        const ensured = await ensureIptvToken({
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: cfg.iptvBearerToken?.trim() || "",
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        const creds: IptvPanelCreds = {
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: ensured.token,
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId.trim() || "1",
          regPassword: plat.regPassword?.trim() || undefined,
          apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
        };
        const rows = await listIptvResellers(creds);
        const logs = await buildResellerMovementLogs(creds, rows);
        if (!cancelled) setResellerMovesByMonth(sumMovementsByMonth(logs));
      } catch {
        if (!cancelled) setResellerMovesByMonth({});
      }
    };
    void run();
    const off = onUniplayCreditsChanged(() => void run());
    return () => {
      cancelled = true;
      off();
    };
  }, [user, resellersFolderId, uniplayConnected]);

  const folders = useMemo(
    () =>
      data.folders
        .filter((f) => f.userId === user?.id)
        .filter((f) => !/^Pasta recuperada\b/i.test(f.name))
        .map((f) =>
          /^d[ií]vidas?$/i.test(f.name.trim()) && f.type !== "Dívida"
            ? { ...f, type: "Dívida" as FolderType }
            : f,
        ),
    [data.folders, user?.id],
  );

  const revenueFolderIds = useMemo(
    () => new Set(folders.filter((f) => isRevenueFolderType(f.type)).map((f) => f.id)),
    [folders],
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

  /** Lucro: só Cliente/Produto e ainda não vencidos */
  const revenueItems = useMemo(
    () =>
      myItems.filter(
        (i) =>
          revenueFolderIds.has(i.folderId) && i.status !== "Já Vencido",
      ),
    [myItems, revenueFolderIds],
  );

  const stats = useMemo(() => {
    return Object.fromEntries(
      folders.map((folder) => {
        const items = myItems.filter((i) => i.folderId === folder.id);
        const overdue = items.filter((i) => i.status === "Já Vencido").length;
        // Cliente/Produto: valor só de quem ainda não venceu (lucro ativo)
        // Dívida: soma os gastos em aberto (também sem já vencidos na conta “ativa”)
        const activeItems = items.filter((i) => i.status !== "Já Vencido");
        return [
          folder.id,
          {
            count: items.length,
            activeCount: activeItems.length,
            total: activeItems.reduce((s, i) => s + (i.price || 0), 0),
            overdue,
          },
        ];
      }),
    ) as Record<
      string,
      { count: number; activeCount: number; total: number; overdue: number }
    >;
  }, [folders, myItems]);

  const kpis = useMemo(() => {
    const today = startOfDay(new Date());
    const week = {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    };
    const month = { start: startOfMonth(today), end: endOfMonth(today) };

    const profitItems = myItems.filter((i) => revenueFolderIds.has(i.folderId));
    const longe = profitItems.filter((i) => i.status === "Longe de Vencer").length;
    const perto = profitItems.filter((i) => i.status === "Perto de Vencer").length;
    const vencido = profitItems.filter((i) => i.status === "Já Vencido").length;
    const withDue = longe + perto + vencido;
    const healthy = withDue ? Math.round((longe / withDue) * 100) : 100;
    // Carteira / lucro: sem dívidas e sem já vencidos
    const revenue = revenueItems.reduce((s, i) => s + (i.price || 0), 0);

    const dueInRange = (interval: { start: Date; end: Date }) =>
      profitItems.filter((i) => {
        if (!i.dueDate) return false;
        try {
          const d = parseISO(String(i.dueDate).slice(0, 10));
          return isWithinInterval(d, interval);
        } catch {
          return false;
        }
      }).length;

    const next7 = profitItems
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
          const hasOverdueCreated = profitItems.some((item) => {
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
          void hasOverdueCreated;
        }
        const overdueDates = profitItems
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
  }, [myItems, revenueFolderIds, revenueItems]);

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
      for (const p of getRecordedPayments(item)) {
        const y = Number(String(p.paidAt).slice(0, 4));
        if (y >= 2020) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [myItems]);

  const chartItems = useMemo(() => {
    if (chartFolderId === "all") {
      // Lucro: todas as pastas Cliente/Produto (dívidas ficam de fora)
      return myItems.filter((i) => revenueFolderIds.has(i.folderId));
    }
    return myItems.filter((i) => i.folderId === chartFolderId);
  }, [chartFolderId, myItems, revenueFolderIds]);

  const monthlyChart = useMemo(() => {
    const monthKey = (idx: number) =>
      `${chartYear}-${String(idx + 1).padStart(2, "0")}`;
    // Acrescenta as movimentações (recargas) de revendedores a cada mês
    const applyMoves = (
      rows: { name: string; total: number; itens: number }[],
    ) =>
      rows.map((row, idx) => ({
        ...row,
        total: row.total + (resellerMovesByMonth[monthKey(idx)] || 0),
      }));
    const isResellerFolder =
      Boolean(resellersFolderId) && chartFolderId === resellersFolderId;
    if (isResellerFolder) {
      return applyMoves(
        sumRecordedPaymentsByMonth(chartItems, chartYear),
      );
    }
    if (chartFolderId === "all" && resellersFolderId) {
      const clients = chartItems.filter(
        (i) => i.folderId !== resellersFolderId,
      );
      const resellers = chartItems.filter(
        (i) => i.folderId === resellersFolderId,
      );
      const a = sumPaymentsByMonth(clients, chartYear);
      const b = applyMoves(
        sumRecordedPaymentsByMonth(resellers, chartYear),
      );
      return a.map((row, idx) => ({
        name: row.name,
        total: row.total + (b[idx]?.total || 0),
        itens: row.itens + (b[idx]?.itens || 0),
      }));
    }
    return sumPaymentsByMonth(chartItems, chartYear);
  }, [
    chartYear,
    chartItems,
    chartFolderId,
    resellersFolderId,
    resellerMovesByMonth,
  ]);

  const annualBalance = useMemo(() => {
    const isResellerFolder =
      Boolean(resellersFolderId) && chartFolderId === resellersFolderId;
    if (isResellerFolder) {
      return sumResellerCreditsValueByItems(
        chartItems,
        resellerCreditPriceBrl,
      );
    }
    if (chartFolderId === "all" && resellersFolderId) {
      const clients = chartItems.filter(
        (i) => i.folderId !== resellersFolderId,
      );
      const resellers = chartItems.filter(
        (i) => i.folderId === resellersFolderId,
      );
      return (
        annualPaymentBalance(clients, chartYear) +
        sumResellerCreditsValueByItems(resellers, resellerCreditPriceBrl)
      );
    }
    return annualPaymentBalance(chartItems, chartYear);
  }, [
    chartYear,
    chartItems,
    chartFolderId,
    resellersFolderId,
    resellerCreditPriceBrl,
  ]);

  const ranking = useMemo(
    () =>
      [...folders]
        .filter((f) => isRevenueFolderType(f.type))
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
    const map: Record<FolderType, Folder[]> = {
      Cliente: [],
      Dívida: [],
    };
    for (const f of folders) map[f.type].push(f);
    return map;
  }, [folders]);

  const debtFolderIds = useMemo(
    () => new Set(folders.filter((f) => isExpenseFolderType(f.type)).map((f) => f.id)),
    [folders],
  );

  const debtItems = useMemo(
    () => myItems.filter((i) => debtFolderIds.has(i.folderId)),
    [myItems, debtFolderIds],
  );

  const debtRows = useMemo(
    () =>
      debtItems.map((item) => {
        const plan = getDebtPlan(item);
        const summary = debtSummary(plan);
        return { item, plan, summary };
      }),
    [debtItems],
  );

  const debtKpis = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
    let aberto = 0;
    let atrasadoValor = 0;
    let atrasadas = 0;
    let emDia = 0;
    let encerradas = 0;
    let ilimitadas = 0;
    const nextDue: {
      id: string;
      name: string;
      dueDate: string;
      amount: number;
    }[] = [];

    for (const { item, plan, summary } of debtRows) {
      if (summary.lifecycle === "quitada") encerradas += 1;
      else if (summary.lifecycle === "atrasada") atrasadas += 1;
      else emDia += 1;
      if (summary.unlimited && !summary.closed) ilimitadas += 1;
      if (!summary.closed) aberto += summary.openAmount;
      for (const inst of plan.installments) {
        if (!inst.paidAt && inst.dueDate < today) atrasadoValor += inst.amount;
        if (
          !inst.paidAt &&
          !summary.closed &&
          inst.dueDate >= today &&
          inst.dueDate <= weekEnd
        ) {
          nextDue.push({
            id: `${item.id}-${inst.n}`,
            name: item.name,
            dueDate: inst.dueDate,
            amount: inst.amount,
          });
        }
      }
    }

    nextDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      aberto: Math.round(aberto * 100) / 100,
      atrasadoValor: Math.round(atrasadoValor * 100) / 100,
      atrasadas,
      emDia,
      encerradas,
      ilimitadas,
      total: debtRows.length,
      nextDue: nextDue.slice(0, 8),
      pie: [
        { name: "Em dia", value: emDia, color: "hsl(var(--warning))" },
        { name: "Atraso", value: atrasadas, color: "hsl(var(--destructive))" },
        { name: "Encerrada", value: encerradas, color: "hsl(var(--success))" },
      ],
    };
  }, [debtRows]);

  const debtMonthlyChart = useMemo(
    () => sumDebtPaidByMonth(debtItems, chartYear),
    [debtItems, chartYear],
  );

  const debtAnnualPaid = useMemo(
    () => annualDebtPaid(debtItems, chartYear),
    [debtItems, chartYear],
  );

  const debtRanking = useMemo(
    () =>
      [...folders]
        .filter((f) => isExpenseFolderType(f.type))
        .map((f) => {
          const rows = debtRows.filter((r) => r.item.folderId === f.id);
          const open = rows
            .filter((r) => !r.summary.closed)
            .reduce((s, r) => s + r.summary.openAmount, 0);
          const overdue = rows.filter(
            (r) => r.summary.lifecycle === "atrasada",
          ).length;
          return {
            folder: f,
            total: Math.round(open * 100) / 100,
            count: rows.length,
            overdue,
          };
        })
        .sort((a, b) => b.total - a.total),
    [folders, debtRows],
  );

  const debtDueDates = useMemo(() => {
    const dates: (string | null)[] = [];
    for (const { plan, summary } of debtRows) {
      if (summary.closed) continue;
      for (const inst of plan.installments) {
        if (!inst.paidAt) dates.push(inst.dueDate);
      }
    }
    return dates;
  }, [debtRows]);

  const openCreate = () => {
    setEditFolder(null);
    setName("");
    setType(workspace);
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
        title={isDebtWorkspace ? "Dívidas" : "Operações"}
        description={
          isDebtWorkspace
            ? "Gastos, parcelas e contas a pagar — separado do lucro."
            : "Visão geral de pastas, vencimentos e valores em carteira."
        }
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {isDebtWorkspace ? "Nova pasta de dívida" : "Nova pasta"}
          </Button>
        }
      />

      <section className="mb-8 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-muted/40 to-background p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <FolderKanban className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">
                {isDebtWorkspace ? "Pastas de dívidas" : "Minhas pastas"}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {isDebtWorkspace
                ? "Abra para lançar gastos e marcar parcelas"
                : "Abra uma pasta para gerenciar itens"}
            </p>
          </div>
        </div>
        <Tabs
          value={workspace}
          onValueChange={(v) => setWorkspace(v as FolderType)}
        >
          <TabsList className="bg-background/80">
            <TabsTrigger value="Cliente">Clientes</TabsTrigger>
            <TabsTrigger value="Dívida">Dívidas</TabsTrigger>
          </TabsList>
          {(["Cliente", "Dívida"] as FolderType[]).map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              {byType[t].length === 0 ? (
                <EmptyState
                  icon={t === "Dívida" ? CircleDollarSign : FolderKanban}
                  title={
                    t === "Dívida"
                      ? "Sem pastas de dívidas"
                      : `Sem pastas de ${t.toLowerCase()}`
                  }
                  description={
                    t === "Dívida"
                      ? "Crie uma pasta para planos, cartão e outros gastos."
                      : "Organize sua carteira criando uma pasta."
                  }
                  action={
                    <Button
                      onClick={() => {
                        setWorkspace(t);
                        setEditFolder(null);
                        setName("");
                        setType(t);
                        setFormOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Nova pasta
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {byType[t].map((folder, idx) => (
                    <motion.li
                      key={folder.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="group flex items-center gap-3 rounded-xl border border-primary/10 bg-background/90 p-3.5 shadow-sm ring-1 ring-primary/5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
                    >
                      <Link
                        to={`/folders/${folder.id}`}
                        className="flex min-w-0 flex-1 items-start gap-3"
                      >
                        <span
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                          aria-hidden
                        >
                          {t === "Dívida" ? (
                            <CircleDollarSign className="h-5 w-5" />
                          ) : (
                            <FolderKanban className="h-5 w-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="border-transparent bg-primary/10 text-primary"
                            >
                              {folder.type}
                            </Badge>
                            {(stats[folder.id]?.overdue || 0) > 0 ? (
                              <Badge variant="destructive">
                                {text(`${stats[folder.id].overdue} atrasados`)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="truncate font-semibold tracking-tight group-hover:text-primary">
                            {folder.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {text(
                              `${stats[folder.id]?.activeCount || 0} ativos`,
                            )}{" "}
                            · {money(stats[folder.id]?.total || 0)}
                          </p>
                        </div>
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

      {uniplayConnected || loadingCredits ? (
        <div
          className={
            uniplayCredits != null && uniplayCredits > 0
              ? "mb-4 ax-surface flex flex-wrap items-center justify-between gap-3 border-success/30 bg-success/5 p-3"
              : "mb-4 ax-surface flex flex-wrap items-center justify-between gap-3 p-3"
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <Coins className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Créditos UniPlay
              </p>
              <p className="text-lg font-semibold tabular-nums tracking-tight">
                {loadingCredits && uniplayCredits == null
                  ? "…"
                  : num(formatIptvCredits(uniplayCredits ?? 0))}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Saldo do painel</p>
        </div>
      ) : null}

      {isDebtWorkspace ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              label="Pastas de dívida"
              value={num(byType.Dívida.length)}
              icon={FolderKanban}
              hint={text(`${debtKpis.total} dívidas cadastradas`)}
              delay={0.02}
            />
            <StatCard
              label="Em aberto"
              value={money(debtKpis.aberto)}
              icon={CircleDollarSign}
              hint={text(`${debtKpis.ilimitadas} recorrentes / ilimitadas`)}
              delay={0.06}
            />
            <StatCard
              label="Em atraso"
              value={num(debtKpis.atrasadas)}
              icon={AlertTriangle}
              tone={debtKpis.atrasadas ? "danger" : "success"}
              hint={money(debtKpis.atrasadoValor)}
              delay={0.1}
            />
            <StatCard
              label="Em dia"
              value={num(debtKpis.emDia)}
              icon={Clock3}
              tone="warning"
              hint={text(`${debtKpis.encerradas} encerradas`)}
              delay={0.14}
            />
            <StatCard
              label={`Pago em ${chartYear}`}
              value={money(debtAnnualPaid)}
              icon={TrendingDown}
              tone="default"
              hint="Soma das parcelas já pagas no ano"
              delay={0.18}
            />
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Em dia",
                value: debtKpis.emDia,
                icon: Clock3,
              },
              {
                label: "Em atraso",
                value: debtKpis.atrasadas,
                icon: AlertTriangle,
              },
              {
                label: "Encerradas",
                value: debtKpis.encerradas,
                icon: CheckCircle2,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="ax-surface flex items-center justify-between p-4"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dívidas · {item.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{num(item.value)}</p>
                </div>
                <item.icon className="h-5 w-5 text-primary/70" />
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="ax-surface p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold tracking-tight">
                    Gastos pagos por mês
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Parcelas marcadas como pagas no ano
                  </p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-primary">
                    Total pago {chartYear}: {money(debtAnnualPaid)}
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
                  <BarChart data={debtMonthlyChart}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                      tickFormatter={(v) => num(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      formatter={(value: number) => [
                        money(Number(value)),
                        "Pago",
                      ]}
                    />
                    <Bar
                      dataKey="total"
                      fill="hsl(var(--destructive))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ax-surface p-5">
              <h2 className="font-semibold tracking-tight">Distribuição</h2>
              <p className="mb-2 text-sm text-muted-foreground">
                Situação das dívidas
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={debtKpis.pie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {debtKpis.pie.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Em aberto</span>
                  <span className="font-semibold">
                    {money(debtKpis.aberto)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Atrasado</span>
                  <span className="font-semibold text-destructive">
                    {money(debtKpis.atrasadoValor)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="ax-surface p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold tracking-tight">
                Mapa de vencimentos das parcelas
              </h2>
              <DueHeatmap dueDates={debtDueDates} />
            </div>
            <div className="ax-surface p-5">
              <h2 className="mb-3 font-semibold tracking-tight">
                Parcelas nos próximos 7 dias
              </h2>
              {debtKpis.nextDue.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma parcela vence nos próximos 7 dias.
                </p>
              ) : (
                <ul className="space-y-2">
                  {debtKpis.nextDue.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg border bg-muted/40 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBrDate(row.dueDate)} ·{" "}
                        {money(row.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mb-6 ax-surface p-5">
            <h2 className="mb-4 font-semibold tracking-tight">
              Ranking · valor em aberto
            </h2>
            {debtRanking.length === 0 ? (
              <EmptyState
                icon={CircleDollarSign}
                title="Nenhuma pasta de dívida"
                description="Crie uma pasta Dívida para começar."
                action={
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Nova pasta
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {debtRanking.map((row, idx) => (
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
                          {money(row.total)}
                        </span>
                      </div>
                      <Progress
                        value={
                          hidden
                            ? 0
                            : debtKpis.aberto
                              ? Math.min(
                                  100,
                                  (row.total / debtKpis.aberto) * 100,
                                )
                              : 0
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {text(
                          `${row.count} dívidas${
                            row.overdue ? ` · ${row.overdue} em atraso` : ""
                          }`,
                        )}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              label="Pastas"
              value={num(byType.Cliente.length)}
              icon={FolderKanban}
              hint={text(`${byType.Cliente.length} clientes`)}
              delay={0.02}
            />
            <StatCard
              label="Itens ativos"
              value={num(revenueItems.length)}
              icon={CalendarClock}
              hint={text(
                `${kpis.day} vencem hoje · ${kpis.week} na semana`,
              )}
              delay={0.06}
            />
            <StatCard
              label="Em atraso"
              value={num(kpis.vencido)}
              icon={AlertTriangle}
              tone={kpis.vencido ? "danger" : "success"}
              hint={text(`${kpis.perto} perto de vencer`)}
              delay={0.1}
            />
            <StatCard
              label="Carteira"
              value={money(kpis.revenue)}
              icon={TrendingUp}
              tone="success"
              hint={text(`Saúde ${kpis.healthy}% em dia`)}
              delay={0.14}
            />
            <StatCard
              label={`Saldo anual ${chartYear}`}
              value={money(annualBalance)}
              icon={BarChart3}
              tone="default"
              hint="Lucro Cliente/Produto · sem dívidas nem vencidos"
              delay={0.18}
            />
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Hoje", value: kpis.day },
              { label: "Esta semana", value: kpis.week },
              { label: "Este mês", value: kpis.month },
            ].map((item) => (
              <div
                key={item.label}
                className="ax-surface flex items-center justify-between p-4"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vencimentos · {item.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{num(item.value)}</p>
                </div>
                <BarChart3 className="h-5 w-5 text-primary/70" />
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="ax-surface p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold tracking-tight">
                    Receita por mês
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Cliente/Produto até o vencimento · recargas de revendedor
                    entram pelo valor pago · sem dívidas
                  </p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-primary">
                    Saldo anual {chartYear}: {money(annualBalance)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={chartFolderId}
                    onValueChange={setChartFolderId}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Pasta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Lucro (sem dívidas)</SelectItem>
                      {folders
                        .filter((f) => isRevenueFolderType(f.type))
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
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
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      stroke="hsl(var(--border))"
                      tickFormatter={(v) => num(v)}
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
                          ? [money(Number(value)), "Total"]
                          : [num(value), "Itens"]
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
              <p className="mb-2 text-sm text-muted-foreground">
                Status dos itens
              </p>
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
                    <Tooltip
                      formatter={(value: number) => [num(value), "Itens"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa em dia</span>
                  <span className="font-semibold">
                    {hidden ? "••" : `${kpis.healthy}%`}
                  </span>
                </div>
                <Progress value={hidden ? 0 : kpis.healthy} />
                <p className="text-xs text-muted-foreground">
                  {text(
                    `Sequência sem novo atraso crítico: ${kpis.streakDays} dia(s)`,
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="ax-surface p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold tracking-tight">
                Mapa de vencimentos
              </h2>
              <DueHeatmap
                dueDates={collectDueDates(
                  myItems.filter((i) => revenueFolderIds.has(i.folderId)),
                )}
              />
            </div>
            <div className="ax-surface p-5">
              <h2 className="mb-3 font-semibold tracking-tight">
                Próximos 7 dias
              </h2>
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
                        {formatBrDate(item.dueDate)} · {money(item.price || 0)}
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
                          {money(row.total)}
                        </span>
                      </div>
                      <Progress
                        value={
                          hidden
                            ? 0
                            : kpis.revenue
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
        </>
      )}

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
                  <SelectItem value="Dívida">Dívida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-name">Nome</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === "Dívida"
                    ? "Ex.: Pessoal, Casa, Cartões…"
                    : "Ex.: IPTV, Internet…"
                }
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
