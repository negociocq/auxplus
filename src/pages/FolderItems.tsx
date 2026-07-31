import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  MessageSquareText,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import {
  computeItemStatus,
  createItem,
  deleteAllItemsInFolder,
  deleteItem,
  moveItem,
  updateFolderSettings,
  updateItem,
  upsertWhatsappMessage,
} from "@/lib/storage";
import { formatBrDate, formatMoney } from "@/lib/format";
import {
  annualPaymentBalance,
  stripPaymentMarker,
  sumPaymentsByMonth,
} from "@/lib/payments";
import type { Item, ItemStatus } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DebtFolderView } from "@/components/debt/DebtFolderView";
import { isExpenseFolderType } from "@/types";

type DueMode = "com" | "sem";

const emptyForm = {
  itemId: "",
  name: "",
  createdAt: "",
  dueMode: "com" as DueMode,
  dueDate: "",
  phone: "+55",
  price: "",
  notes: "",
};

const STATUS_ORDER: Record<ItemStatus, number> = {
  "Longe de Vencer": 0,
  "Perto de Vencer": 1,
  "Já Vencido": 2,
  "Sem Vencimento": 3,
};

/** Barra lateral + fundo do card: forte no início → fraco no meio → sem cor no fim */
const STATUS_BAR: Record<ItemStatus, string> = {
  "Longe de Vencer": "bg-success",
  "Perto de Vencer": "bg-warning",
  "Já Vencido": "bg-destructive",
  "Sem Vencimento": "bg-muted-foreground/50",
};

const STATUS_FIELD: Record<ItemStatus, string> = {
  "Longe de Vencer":
    "bg-[linear-gradient(90deg,hsl(var(--success)_/_0.12)_0%,hsl(var(--success)_/_0.04)_35%,transparent_70%)]",
  "Perto de Vencer":
    "bg-[linear-gradient(90deg,hsl(var(--warning)_/_0.14)_0%,hsl(var(--warning)_/_0.05)_35%,transparent_70%)]",
  "Já Vencido":
    "bg-[linear-gradient(90deg,hsl(var(--destructive)_/_0.12)_0%,hsl(var(--destructive)_/_0.04)_35%,transparent_70%)]",
  "Sem Vencimento":
    "bg-[linear-gradient(90deg,hsl(var(--muted-foreground)_/_0.08)_0%,transparent_65%)]",
};

function defaultWhatsapp(folderType: string) {
  if (folderType === "Produto") {
    return `{getGreeting}

Gostaríamos de lembrá-lo(a) sobre o vencimento do seguinte produto:

Produto: {name}

{dateText} {due_date}

Por favor, tome as medidas necessárias para gerenciar este produto antes da data de vencimento. Se precisar de mais informações ou assistência, estamos à disposição.

Obrigado pela atenção.`;
  }
  return `{getGreeting}

🔔 Lembrete da "Empresa" 🔔

Usuário: {item_id}

{dateText} {due_date}

Não esqueça de renovar para continuar assistindo sem interrupções.

Aproveite seus programas favoritos! 📺✨

> Obrigado pela sua preferência! 🌟`;
}

function getGreeting() {
  const hours = new Date().getHours();
  if (hours < 12) return "Bom dia,";
  if (hours < 18) return "Boa tarde,";
  return "Boa noite,";
}

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

function sendReminder(item: Item, template: string) {
  const phone = phoneDigits(item.phone || "");
  if (!phone) {
    toast.error("Este item não tem telefone cadastrado.");
    return;
  }
  if (!item.dueDate) {
    toast.error("Este item não tem data de vencimento.");
    return;
  }

  const due = parseISO(item.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueCmp = new Date(due);
  dueCmp.setHours(0, 0, 0, 0);
  const isExpired = dueCmp < today;
  const dateText = isExpired ? "Venceu em:" : "Vai vencer em:";
  const formattedDue = format(due, "dd/MM/yyyy");

  const message = template
    .replace(/\{getGreeting\}/g, getGreeting())
    .replace(/\{item_id\}/g, item.itemId)
    .replace(/\{name\}/g, item.name)
    .replace(/\{dateText\}/g, dateText)
    .replace(/\{due_date\}/g, formattedDue);

  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) window.location.href = url;
  else window.open(url, "_blank");
  toast.success("Abrindo WhatsApp…");
}

export default function FolderItems() {
  const { folderId } = useParams();
  const { user, data, setData } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ItemStatus>("all");
  const [showTools, setShowTools] = useState(false);
  const [showAnnualChart, setShowAnnualChart] = useState(false);
  const [showStatusSlide, setShowStatusSlide] = useState(false);
  const [chartYear, setChartYear] = useState(new Date().getFullYear());
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsOpen, setWhatsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [nearDays, setNearDays] = useState(3);
  const [farDays, setFarDays] = useState(3);
  const [whatsMsg, setWhatsMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const folder = data.folders.find(
    (f) => f.id === folderId && f.userId === user?.id,
  );
  const settings = data.folderSettings.find((s) => s.folderId === folderId);
  const nearDueDays = settings?.nearDueDays ?? 3;
  const farDueDays = settings?.farDueDays ?? nearDueDays;
  const userFolders = useMemo(
    () => data.folders.filter((f) => f.userId === user?.id && f.id !== folderId),
    [data.folders, user?.id, folderId],
  );

  // Status sempre ao vivo (igual items.php / DATEDIFF), não confia no campo salvo
  const folderItems = useMemo(
    () =>
      data.items
        .filter((i) => i.folderId === folderId)
        .map((i) => ({
          ...i,
          status: computeItemStatus(i.dueDate, nearDueDays, farDueDays),
        })),
    [data.items, folderId, nearDueDays, farDueDays],
  );

  const counts = useMemo(() => {
    const c = {
      all: folderItems.length,
      "Longe de Vencer": 0,
      "Perto de Vencer": 0,
      "Já Vencido": 0,
      "Sem Vencimento": 0,
    };
    for (const i of folderItems) c[i.status] += 1;
    return c;
  }, [folderItems]);

  const items = useMemo(() => {
    return folderItems
      .filter((i) => {
        if (statusFilter !== "all" && i.status !== statusFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          i.name.toLowerCase().includes(q) ||
          i.itemId.toLowerCase().includes(q) ||
          i.phone.toLowerCase().includes(q) ||
          stripPaymentMarker(i.notes).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Original PHP: Longe → Perto → Vencido → Sem; due_date DESC
        const byStatus =
          (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        if (byStatus !== 0) return byStatus;
        if (!a.dueDate && !b.dueDate) return a.name.localeCompare(b.name);
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        const byDate = b.dueDate.localeCompare(a.dueDate);
        if (byDate !== 0) return byDate;
        return (
          Number(a.itemId) - Number(b.itemId) || a.name.localeCompare(b.name)
        );
      });
  }, [folderItems, search, statusFilter]);

  const chartYears = useMemo(() => {
    const yNow = new Date().getFullYear();
    const years = new Set<number>([yNow]);
    for (const item of folderItems) {
      for (const raw of [item.createdAt, item.dueDate]) {
        if (!raw) continue;
        const y = Number(String(raw).slice(0, 4));
        if (y >= 2020 && y <= yNow + 1) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [folderItems]);

  const chartData = useMemo(
    () => sumPaymentsByMonth(folderItems, chartYear),
    [chartYear, folderItems],
  );

  const annualBalance = useMemo(
    () => annualPaymentBalance(folderItems, chartYear),
    [chartYear, folderItems],
  );

  const statusChartData = useMemo(() => {
    const rows: { status: ItemStatus; name: string; color: string }[] = [
      { status: "Longe de Vencer", name: "Longe", color: "#1f8a5b" },
      { status: "Perto de Vencer", name: "Perto", color: "#c9841a" },
      { status: "Já Vencido", name: "Vencido", color: "#c94b3a" },
      { status: "Sem Vencimento", name: "Sem", color: "#6b7f86" },
    ];
    return rows.map((row) => ({
      name: row.name,
      fullName: row.status,
      count: counts[row.status],
      price: folderItems
        .filter((item) => item.status === row.status)
        .reduce((s, item) => s + (item.price || 0), 0),
      color: row.color,
    }));
  }, [counts, folderItems]);

  const totalPrice = useMemo(() => {
    // Lucro ativo: sem já vencidos (dívidas mantêm a soma completa dos gastos)
    const list =
      folder?.type === "Dívida"
        ? folderItems
        : folderItems.filter((i) => i.status !== "Já Vencido");
    return list.reduce((s, i) => s + (i.price || 0), 0);
  }, [folder?.type, folderItems]);

  if (!folder || !user) return <Navigate to="/dashboard" replace />;

  const debtFolder =
    isExpenseFolderType(folder.type) ||
    /^d[ií]vidas?$/i.test(folder.name.trim());
  if (debtFolder) {
    return (
      <DebtFolderView
        folder={
          folder.type === "Dívida" ? folder : { ...folder, type: "Dívida" }
        }
      />
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      createdAt: format(new Date(), "yyyy-MM-dd"),
    });
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      itemId: item.itemId,
      name: item.name,
      createdAt: item.createdAt
        ? String(item.createdAt).slice(0, 10)
        : format(new Date(), "yyyy-MM-dd"),
      dueMode: item.status === "Sem Vencimento" || !item.dueDate ? "sem" : "com",
      dueDate: item.dueDate ?? "",
      phone: item.phone || "+55",
      price: item.price != null ? String(item.price) : "",
      notes: stripPaymentMarker(item.notes),
    });
    setFormOpen(true);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const noDue = form.dueMode === "sem";
    const price = Number(String(form.price).replace(",", ".")) || 0;
    const payload = {
      folderId: folder.id,
      itemId: form.itemId.trim(),
      name: form.name.trim(),
      dueDate: noDue ? null : form.dueDate || null,
      phone: form.phone.trim(),
      price,
      notes: form.notes.trim(),
      createdAt: form.createdAt
        ? `${form.createdAt}T00:00:00`
        : new Date().toISOString(),
      isActive: true,
    };
    if (editing) {
      setData(updateItem(data, { ...editing, ...payload }));
      toast.success("Item atualizado");
    } else {
      setData(createItem(data, payload));
      toast.success("Item adicionado");
    }
    setFormOpen(false);
  };

  const reminderTemplate = () => {
    const existing = data.whatsappMessages?.find(
      (m) => m.userId === user.id && m.folderId === folder.id,
    );
    return existing?.message || defaultWhatsapp(folder.type);
  };

  const openWhats = () => {
    setWhatsMsg(reminderTemplate());
    setWhatsOpen(true);
  };

  const onImportCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV vazio ou inválido");
      return;
    }
    let next = data;
    let imported = 0;
    for (const line of lines.slice(1)) {
      const cols = line.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 2) continue;
      const [itemId, name, dueDate, phone, price, notes] = cols;
      next = createItem(next, {
        folderId: folder.id,
        itemId: itemId || name,
        name: name || itemId,
        dueDate: dueDate || null,
        phone: phone || "",
        price: Number(String(price || "0").replace(",", ".")) || 0,
        notes: notes || "",
        createdAt: new Date().toISOString(),
        isActive: true,
      });
      imported += 1;
    }
    setData(next);
    toast.success(
      imported === 1
        ? "1 item importado"
        : `${imported} itens importados`,
    );
  };

  const filterChips: { key: "all" | ItemStatus; label: string; count: number }[] =
    [
      { key: "all", label: "Todos", count: counts.all },
      {
        key: "Longe de Vencer",
        label: "Longe",
        count: counts["Longe de Vencer"],
      },
      {
        key: "Perto de Vencer",
        label: "Perto",
        count: counts["Perto de Vencer"],
      },
      { key: "Já Vencido", label: "Vencido", count: counts["Já Vencido"] },
      {
        key: "Sem Vencimento",
        label: "Sem",
        count: counts["Sem Vencimento"],
      },
    ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={folder.name}
        description="Vencimentos, lembretes e valores desta pasta."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Pastas
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowTools((v) => !v)}
            >
              {showTools ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showTools ? "Ocultar Conteúdo" : "Mostrar Conteúdo"}
            </Button>
            <Button onClick={() => setShowStatusSlide(true)}>
              <ChartColumn className="h-4 w-4" />
              Mostrar Gráfico
            </Button>
          </div>
        }
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              statusFilter === chip.key
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {chip.key !== "all" ? (
              <StatusBadge status={chip.key} />
            ) : (
              <Badge variant="secondary" className="font-normal">
                Todos
              </Badge>
            )}
            <span className="tabular-nums">{chip.count}</span>
          </button>
        ))}
      </div>

      {/* Tools panel */}
      <AnimatePresence initial={false}>
        {showTools && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="ax-surface flex flex-wrap gap-2 p-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImportCsv(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Importar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      "Tem certeza que deseja excluir todos os itens desta pasta?",
                    )
                  ) {
                    setData(deleteAllItemsInFolder(data, folder.id));
                    toast.success("Todos os itens foram excluídos");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Excluir Todos
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Adicionar Novo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNearDays(settings?.nearDueDays ?? 3);
                  setFarDays(settings?.farDueDays ?? 3);
                  setSettingsOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                Editar Prazo de Vencimento
              </Button>
              <Button variant="outline" size="sm" onClick={openWhats}>
                <MessageSquareText className="h-4 w-4" />
                Editar Mensagem do WhatsApp
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Annual chart */}
      <div className="ax-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold tracking-tight">Consultar Anual</h2>
            <p className="text-sm text-muted-foreground">
              {folder.type === "Dívida"
                ? "Gastos por mês (dívidas) — não entra no lucro da página inicial"
                : "Lucro até o vencimento · já vencidos não entram no mês atual"}
            </p>
            <p className="mt-2 text-lg font-bold tracking-tight text-primary">
              Saldo anual {chartYear}: {formatMoney(annualBalance)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(chartYear)}
              onValueChange={(v) => {
                setChartYear(Number(v));
                setShowAnnualChart(true);
              }}
            >
              <SelectTrigger className="w-[120px]" id="yearSelect">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnnualChart((v) => !v)}
            >
              <CalendarDays className="h-4 w-4" />
              {showAnnualChart ? "Esconder Gráfico" : "Mostrar Gráfico"}
            </Button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showAnnualChart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="h-[260px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
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
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [
                        formatMoney(Number(value)),
                        "Total",
                      ]}
                    />
                    <Bar
                      dataKey="total"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search + status select */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Pesquisar itens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | ItemStatus)}
        >
          <SelectTrigger className="w-full sm:w-[240px]" id="color-filter">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Mostrar Todos ({counts.all})
            </SelectItem>
            <SelectItem value="Sem Vencimento">
              Sem vencimento ({counts["Sem Vencimento"]})
            </SelectItem>
            <SelectItem value="Longe de Vencer">
              Longe de Vencer ({counts["Longe de Vencer"]})
            </SelectItem>
            <SelectItem value="Perto de Vencer">
              Perto de Vencer ({counts["Perto de Vencer"]})
            </SelectItem>
            <SelectItem value="Já Vencido">
              Já Vencido ({counts["Já Vencido"]})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Item list */}
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum item encontrado"
          description={
            search || statusFilter !== "all"
              ? "Ajuste a busca ou o filtro de status."
              : "Adicione o primeiro item desta pasta."
          }
          action={
            !search && statusFilter === "all" ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Adicionar Novo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{
                  duration: 0.2,
                  delay: Math.min(index * 0.02, 0.2),
                }}
                className={cn(
                  "ax-surface group relative flex overflow-hidden",
                  STATUS_FIELD[item.status],
                )}
              >
                <span
                  className={cn(
                    "w-1.5 shrink-0 self-stretch",
                    STATUS_BAR[item.status],
                  )}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} />
                      <span className="text-xs font-medium text-muted-foreground">
                        Usuário:{" "}
                        <span className="text-foreground">{item.itemId}</span>
                      </span>
                    </div>
                    <h3 className="truncate text-base font-semibold tracking-tight">
                      {item.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        Criado em:{" "}
                        <span className="font-medium text-foreground">
                          {formatBrDate(item.createdAt)}
                        </span>
                      </span>
                      <span>
                        Vencimento:{" "}
                        <span className="font-medium text-foreground">
                          {item.status === "Sem Vencimento" || !item.dueDate
                            ? "Indefinido"
                            : formatBrDate(item.dueDate)}
                        </span>
                      </span>
                      <span>
                        Telefone:{" "}
                        <span className="font-medium text-foreground">
                          {item.phone || "—"}
                        </span>
                      </span>
                      {stripPaymentMarker(item.notes) ? (
                        <span className="w-full truncate">
                          Notas:{" "}
                          <span className="font-medium text-foreground">
                            {stripPaymentMarker(item.notes)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <p className="text-lg font-bold tabular-nums tracking-tight">
                      {formatMoney(item.price || 0)}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Ações"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() =>
                            sendReminder(item, reminderTemplate())
                          }
                        >
                          <Bell className="h-4 w-4" />
                          Lembrar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            setMoveItemId(item.id);
                            setMoveOpen(true);
                          }}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                          Mover
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Excluir "${item.name}"?`)) {
                              setData(deleteItem(data, item.id));
                              toast.success("Item excluído");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Create / Edit item */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Item" : "Adicionar Novo Item"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSave}>
            <div className="space-y-2">
              <Label htmlFor="item-user">Usuário</Label>
              <Input
                id="item-user"
                value={form.itemId}
                onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-name">Nome</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            {editing && (
              <div className="space-y-2">
                <Label htmlFor="item-created">Data de Criação</Label>
                <Input
                  id="item-created"
                  type="date"
                  value={form.createdAt}
                  onChange={(e) =>
                    setForm({ ...form, createdAt: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.dueMode}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    dueMode: v as DueMode,
                    dueDate: v === "sem" ? "" : form.dueDate,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="com">Com Vencimento</SelectItem>
                  <SelectItem value="sem">Sem Vencimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.dueMode === "com" && (
              <div className="space-y-2">
                <Label htmlFor="item-due">Data de Vencimento</Label>
                <Input
                  id="item-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="item-phone">Telefone</Label>
              <Input
                id="item-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-price">Preço</Label>
              <Input
                id="item-price"
                value={form.price}
                placeholder="0.00"
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-notes">Notas</Label>
              <Textarea
                id="item-notes"
                value={form.notes}
                placeholder="Adicione suas notas aqui..."
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editing ? "Atualizar Item" : "Adicionar Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settings: near/far days */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Prazos de Vencimento</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setData(
                updateFolderSettings(data, folder.id, nearDays, farDays),
              );
              setSettingsOpen(false);
              toast.success("Configurações atualizadas");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="near-days">
                Prazos Perto de Vencer (dias)
              </Label>
              <Input
                id="near-days"
                type="number"
                min={1}
                value={nearDays}
                onChange={(e) => setNearDays(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="far-days">
                Prazos Longe de Vencer (dias)
              </Label>
              <Input
                id="far-days"
                type="number"
                min={1}
                value={farDays}
                onChange={(e) => setFarDays(Number(e.target.value))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">Atualizar Configurações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WhatsApp message */}
      <Dialog open={whatsOpen} onOpenChange={setWhatsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Mensagem do WhatsApp</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={12}
            value={whatsMsg}
            onChange={(e) => setWhatsMsg(e.target.value)}
            className="font-mono text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWhatsMsg(defaultWhatsapp(folder.type))}
            >
              Restaurar Mensagem Padrão
            </Button>
            <Button
              type="button"
              onClick={() => {
                setData(
                  upsertWhatsappMessage(data, user.id, folder.id, whatsMsg),
                );
                setWhatsOpen(false);
                toast.success("Mensagem salva");
              }}
            >
              Salvar Mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move item */}
      <Dialog
        open={moveOpen && !!moveItemId}
        onOpenChange={(open) => {
          setMoveOpen(open);
          if (!open) setMoveItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escolha uma Pasta para Mover o Item</DialogTitle>
          </DialogHeader>
          {userFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma outra pasta.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {userFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
                    onClick={() => {
                      if (!moveItemId) return;
                      setData(moveItem(data, moveItemId, f.id));
                      setMoveOpen(false);
                      setMoveItemId(null);
                      toast.success(`Item movido para ${f.name}`);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Status charts sheet */}
      <Sheet open={showStatusSlide} onOpenChange={setShowStatusSlide}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Status dos Itens</SheetTitle>
            <SheetDescription>
              Visão consolidada de quantidade e valores por status.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total de Itens
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {counts.all}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {folder.type === "Dívida" ? "Total de gastos" : "Valor ativo"}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums leading-tight">
                  {formatMoney(totalPrice)}
                </p>
                {folder.type !== "Dívida" && counts["Já Vencido"] > 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sem os {counts["Já Vencido"]} já vencidos
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Status dos Itens</h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [value, "Itens"]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry) => (
                        <Cell key={entry.fullName} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Preço Total por Status
              </h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [
                        formatMoney(Number(value)),
                        "Preço",
                      ]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry) => (
                        <Cell key={`p-${entry.fullName}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Preço Total por Status
              </h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={statusChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [
                        formatMoney(Number(value)),
                        "Preço",
                      ]}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.fullName ?? "")
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
