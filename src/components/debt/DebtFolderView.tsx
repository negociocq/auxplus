import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
  PartyPopper,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import {
  createItem,
  deleteItem,
  updateItem,
} from "@/lib/storage";
import {
  buildDebtPlan,
  closeDebtPlan,
  DEBT_INTERVALS,
  debtSummary,
  getDebtPlan,
  intervalLabel,
  isAmountPending,
  markInstallmentPaid,
  reopenDebtPlan,
  stripDebtMarker,
  unmarkInstallmentPaid,
  updateInstallmentAmount,
  updateInstallmentDueDate,
  withDebtOnItem,
  type DebtAmountMode,
  type DebtLifecycle,
  type DebtMode,
} from "@/lib/debts";
import { stripPaymentMarker } from "@/lib/payments";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import type { Folder, Item } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DebtFilter = "all" | DebtLifecycle;

const LIFE: Record<
  DebtLifecycle,
  { label: string; className: string; bar: string }
> = {
  atrasada: {
    label: "Em atraso",
    className:
      "border-destructive/30 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
  },
  em_dia: {
    label: "Em dia",
    className: "border-warning/30 bg-warning/10 text-warning",
    bar: "bg-warning",
  },
  quitada: {
    label: "Encerrada",
    className: "border-success/30 bg-success/10 text-success",
    bar: "bg-success",
  },
};

function cleanNotes(notes?: string | null) {
  return stripDebtMarker(stripPaymentMarker(notes));
}

function syncParcelAmounts(
  count: number,
  prev: string[],
  fallback = "",
): string[] {
  const n = Math.max(1, Math.min(count, 240));
  return Array.from({ length: n }, (_, i) => prev[i] ?? fallback);
}

export function DebtFolderView({ folder }: { folder: Folder }) {
  const { data, setData } = useApp();
  const { money } = useHideBalance();
  const [filter, setFilter] = useState<DebtFilter>("all");

  const formatParcelAmount = (amount: number, variable: boolean) => {
    if (variable && isAmountPending(amount)) return "A definir";
    return money(amount);
  };
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({
    name: "",
    spentAt: format(new Date(), "yyyy-MM-dd"),
    total: "",
    mode: "fixed" as DebtMode,
    amountMode: "equal" as DebtAmountMode,
    intervalMonths: "1",
    parcels: "1",
    currentParcel: "1",
    firstDue: format(new Date(), "yyyy-MM-dd"),
    parcelAmounts: ["0"] as string[],
    notes: "",
  });
  const [editingAmount, setEditingAmount] = useState<{
    itemId: string;
    n: number;
    value: string;
  } | null>(null);

  const debts = useMemo(() => {
    return data.items
      .filter((i) => i.folderId === folder.id)
      .map((item) => {
        const plan = getDebtPlan(item);
        const summary = debtSummary(plan);
        return { item, plan, summary };
      })
      .sort((a, b) => {
        const order = { atrasada: 0, em_dia: 1, quitada: 2 };
        const byLife =
          order[a.summary.lifecycle] - order[b.summary.lifecycle];
        if (byLife !== 0) return byLife;
        const aDue = a.summary.nextDue?.dueDate ?? "9999";
        const bDue = b.summary.nextDue?.dueDate ?? "9999";
        return aDue.localeCompare(bDue);
      });
  }, [data.items, folder.id]);

  const kpis = useMemo(() => {
    const atrasadas = debts.filter((d) => d.summary.lifecycle === "atrasada");
    const emDia = debts.filter((d) => d.summary.lifecycle === "em_dia");
    const quitadas = debts.filter((d) => d.summary.lifecycle === "quitada");
    const aberto = debts
      .filter((d) => d.summary.lifecycle !== "quitada")
      .reduce((s, d) => s + d.summary.openAmount, 0);
    const atrasadoValor = atrasadas.reduce(
      (s, d) =>
        s +
        d.plan.installments
          .filter((i) => !i.paidAt && i.dueDate < format(new Date(), "yyyy-MM-dd"))
          .reduce((x, i) => x + i.amount, 0),
      0,
    );
    return {
      atrasadas: atrasadas.length,
      emDia: emDia.length,
      quitadas: quitadas.length,
      aberto: Math.round(aberto * 100) / 100,
      atrasadoValor: Math.round(atrasadoValor * 100) / 100,
    };
  }, [debts]);

  const visible = useMemo(() => {
    return debts.filter(({ item, summary }) => {
      if (filter !== "all" && summary.lifecycle !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        cleanNotes(item.notes).toLowerCase().includes(q)
      );
    });
  }, [debts, filter, search]);

  const openCreate = () => {
    setEditing(null);
    const today = format(new Date(), "yyyy-MM-dd");
    setForm({
      name: "",
      spentAt: today,
      total: "",
      mode: "fixed",
      amountMode: "equal",
      intervalMonths: "1",
      parcels: "1",
      currentParcel: "1",
      firstDue: today,
      parcelAmounts: [""],
      notes: "",
    });
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    const plan = getDebtPlan(item);
    const current =
      plan.installments.find((i) => !i.paidAt) ??
      plan.installments[plan.installments.length - 1];
    setEditing(item);
    const knownCount = Math.max(1, current?.n || 1);
    setForm({
      name: item.name,
      spentAt: plan.spentAt,
      total:
        plan.amountMode === "variable"
          ? ""
          : String(
              plan.monthlyAmount ||
                plan.installments.find((i) => i.amount > 0)?.amount ||
                plan.total,
            ),
      mode: plan.mode === "unlimited" ? "unlimited" : "fixed",
      amountMode: plan.amountMode === "variable" ? "variable" : "equal",
      intervalMonths: String(plan.intervalMonths || 1),
      parcels: String(plan.installmentCount || plan.installments.length || 1),
      currentParcel: String(current?.n || 1),
      firstDue: current?.dueDate ?? plan.spentAt,
      // Variável: só valores conhecidos (até a parcela atual)
      parcelAmounts: plan.installments
        .slice(0, knownCount)
        .map((i) => (i.amount > 0 ? String(i.amount) : "")),
      notes: cleanNotes(item.notes),
    });
    setFormOpen(true);
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(String(form.total).replace(",", ".")) || 0;
    const count = Math.max(1, Number(form.parcels) || 1);
    const currentParcel = Math.max(1, Number(form.currentParcel) || 1);
    const knownLen =
      form.mode === "fixed"
        ? Math.min(currentParcel, count)
        : currentParcel;

    let amounts: number[] | undefined;
    if (form.amountMode === "variable") {
      const known = syncParcelAmounts(knownLen, form.parcelAmounts, "").map(
        (v) => Number(String(v).replace(",", ".")) || 0,
      );
      // Completa o restante com 0 (a definir) — nunca rateia o total
      amounts =
        form.mode === "fixed"
          ? Array.from({ length: count }, (_, i) => known[i] ?? 0)
          : known;

      const missingPaid = known
        .slice(0, Math.max(0, knownLen - 1))
        .some((v) => !(v > 0));
      if (missingPaid) {
        toast.error("Informe o valor de cada parcela já paga");
        return;
      }
    }

    let plan = buildDebtPlan({
      spentAt: form.spentAt,
      amount,
      mode: form.mode,
      amountMode: form.amountMode,
      amounts,
      count,
      currentParcel:
        form.mode === "fixed"
          ? Math.min(currentParcel, count)
          : currentParcel,
      firstDue: form.firstDue,
      intervalMonths: Number(form.intervalMonths) || 1,
    });

    // Ao editar ilimitada encerrada, mantém closedAt
    if (editing) {
      const prev = getDebtPlan(editing);
      if (form.mode === "unlimited" && prev.closedAt) {
        plan = { ...plan, closedAt: prev.closedAt };
      }
      // Preserva valores já preenchidos nas parcelas futuras
      if (form.amountMode === "variable" && prev.installments.length) {
        const installments = plan.installments.map((inst) => {
          const old = prev.installments.find((p) => p.n === inst.n);
          if (!old) return inst;
          const amount =
            inst.n > knownLen && old.amount > 0 ? old.amount : inst.amount;
          return {
            ...inst,
            amount,
            paidAt: old.paidAt ?? inst.paidAt,
          };
        });
        plan = {
          ...plan,
          installments,
          total:
            Math.round(
              installments.reduce((s, i) => s + i.amount, 0) * 100,
            ) / 100,
        };
      }
    }

    const base = {
      folderId: folder.id,
      itemId: editing?.itemId || String(Date.now()).slice(-6),
      name: form.name.trim(),
      phone: editing?.phone || "",
      price: plan.total,
      notes: form.notes.trim(),
      createdAt: `${plan.spentAt}T00:00:00`,
      dueDate: plan.installments.find((i) => !i.paidAt)?.dueDate ?? null,
      isActive: true,
      debt: plan,
    };

    if (editing) {
      setData(updateItem(data, withDebtOnItem({ ...editing, ...base }, plan)));
      toast.success("Dívida atualizada");
    } else {
      setData(createItem(data, { ...base, debt: plan }));
      toast.success("Dívida adicionada");
    }
    setFormOpen(false);
  };

  const payParcel = (item: Item, n: number) => {
    const plan = getDebtPlan(item);
    const inst = plan.installments.find((i) => i.n === n);
    if (
      plan.amountMode === "variable" &&
      inst &&
      isAmountPending(inst.amount)
    ) {
      setExpanded(item.id);
      setEditingAmount({
        itemId: item.id,
        n,
        value: "",
      });
      toast.message("Informe o valor desta parcela antes de marcar como paga");
      return;
    }
    const nextPlan = markInstallmentPaid(plan, n);
    setData(updateItem(data, withDebtOnItem(item, nextPlan)));
    const summary = debtSummary(nextPlan);
    if (summary.lifecycle === "quitada" && !summary.unlimited) {
      toast.success("Dívida quitada! Todas as parcelas foram pagas.");
    } else {
      toast.success(`Parcela ${n} marcada como paga`);
    }
  };

  const undoParcel = (item: Item, n: number) => {
    const plan = unmarkInstallmentPaid(getDebtPlan(item), n);
    setData(updateItem(data, withDebtOnItem(item, plan)));
    toast.message(`Parcela ${n} reaberta`);
  };

  const saveParcelAmount = (item: Item, n: number, raw: string) => {
    const value = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    const plan = updateInstallmentAmount(getDebtPlan(item), n, value);
    setData(updateItem(data, withDebtOnItem(item, plan)));
    setEditingAmount(null);
    toast.success(`Valor da parcela ${n} atualizado`);
  };

  const saveParcelDue = (item: Item, n: number, dueDate: string) => {
    if (!dueDate) return;
    const plan = updateInstallmentDueDate(getDebtPlan(item), n, dueDate);
    setData(updateItem(data, withDebtOnItem(item, plan)));
    toast.success(`Vencimento da parcela ${n} atualizado`);
  };

  const closeDebt = (item: Item) => {
    if (
      !confirm(
        "Encerrar esta cobrança recorrente? O histórico de pagamentos fica salvo e as próximas mensalidades param de ser geradas.",
      )
    ) {
      return;
    }
    const plan = closeDebtPlan(getDebtPlan(item));
    setData(updateItem(data, withDebtOnItem(item, plan)));
    toast.success("Cobrança encerrada");
  };

  const reopenDebt = (item: Item) => {
    const plan = reopenDebtPlan(getDebtPlan(item));
    setData(updateItem(data, withDebtOnItem(item, plan)));
    toast.success("Cobrança reaberta — mensalidades voltam a correr");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={folder.name}
        description="Parcelas fixas ou cobrança recorrente. Encerre quando não for mais pagar."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova dívida
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ax-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Em aberto
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {money(kpis.aberto)}
          </p>
        </div>
        <div className="ax-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Em atraso
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-destructive">
            {kpis.atrasadas}
          </p>
          <p className="text-xs text-muted-foreground">
            {money(kpis.atrasadoValor)}
          </p>
        </div>
        <div className="ax-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
            <Clock3 className="h-3.5 w-3.5" />
            Em dia
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{kpis.emDia}</p>
        </div>
        <div className="ax-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Encerradas
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-success">
            {kpis.quitadas}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all" as const, label: "Todas", count: debts.length },
            {
              key: "atrasada" as const,
              label: "Atrasadas",
              count: kpis.atrasadas,
            },
            { key: "em_dia" as const, label: "Em dia", count: kpis.emDia },
            {
              key: "quitada" as const,
              label: "Encerradas",
              count: kpis.quitadas,
            },
          ] as const
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              filter === chip.key
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60",
            )}
          >
            {chip.label}
            <span className="tabular-nums">{chip.count}</span>
          </button>
        ))}
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar dívida…"
        className="max-w-md"
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={CircleDollarSign}
          title="Nenhuma dívida aqui"
          description="À vista, em N parcelas ou cobrança recorrente sem data de fim."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nova dívida
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence mode="popLayout">
            {visible.map(({ item, plan, summary }, index) => {
              const life = LIFE[summary.lifecycle];
              const open = expanded === item.id;
              return (
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
                  className="ax-surface overflow-hidden"
                >
                  <div className="flex">
                    <span
                      className={cn("w-1.5 shrink-0 self-stretch", life.bar)}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={life.className}>{life.label}</Badge>
                            {summary.unlimited ? (
                              <Badge variant="secondary">Ilimitada</Badge>
                            ) : (
                              <Badge variant="secondary">Com prazo</Badge>
                            )}
                            {plan.amountMode === "variable" ? (
                              <Badge variant="outline">Valor variável</Badge>
                            ) : (
                              <Badge variant="outline">Valor fixo</Badge>
                            )}
                            {(plan.intervalMonths || 1) !== 1 ? (
                              <Badge variant="outline">
                                {intervalLabel(plan.intervalMonths)}
                              </Badge>
                            ) : null}
                            {summary.lifecycle === "quitada" ? (
                              <Badge className="gap-1 border-transparent bg-success/15 text-success">
                                <PartyPopper className="h-3 w-3" />
                                {summary.unlimited
                                  ? "Encerrada"
                                  : "Tudo pago"}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {summary.unlimited ? "Começou em" : "Gastou em"}{" "}
                              <span className="font-medium text-foreground">
                                {formatBrDate(plan.spentAt)}
                              </span>
                            </span>
                          </div>
                          <h3 className="text-base font-semibold tracking-tight">
                            {item.name}
                          </h3>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>
                              {summary.unlimited ? (
                                <>
                                  Pagas:{" "}
                                  <span className="font-medium text-foreground">
                                    {summary.paidCount}
                                  </span>
                                  {" · "}
                                  Mensal:{" "}
                                  <span className="font-medium text-foreground">
                                    {money(summary.monthlyAmount)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  Parcelas:{" "}
                                  <span className="font-medium text-foreground">
                                    {summary.paidCount}/{summary.totalCount}
                                  </span>
                                  {!summary.variable &&
                                  summary.monthlyAmount > 0 ? (
                                    <>
                                      {" · "}
                                      {summary.totalCount}× de{" "}
                                      <span className="font-medium text-foreground">
                                        {money(summary.monthlyAmount)}
                                      </span>
                                      {(plan.intervalMonths || 1) !== 1 ? (
                                        <span>
                                          {" "}
                                          · {intervalLabel(plan.intervalMonths)}
                                        </span>
                                      ) : null}
                                    </>
                                  ) : null}
                                </>
                              )}
                            </span>
                            <span>
                              Já pago:{" "}
                              <span className="font-medium text-foreground">
                                {money(summary.paidAmount)}
                              </span>
                            </span>
                            {!summary.closed ? (
                              <span>
                                {summary.variable ? (
                                  summary.openAmount > 0 ? (
                                    <>
                                      Definido em aberto:{" "}
                                      <span className="font-medium text-foreground">
                                        {money(summary.openAmount)}
                                      </span>
                                      {summary.pendingCount > 0 ? (
                                        <span className="text-muted-foreground">
                                          {" "}
                                          · {summary.pendingCount} a preencher
                                        </span>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      {summary.pendingCount} parcela
                                      {summary.pendingCount === 1 ? "" : "s"}{" "}
                                      sem valor (preencha mês a mês)
                                    </span>
                                  )
                                ) : (
                                  <>
                                    Em aberto:{" "}
                                    <span className="font-medium text-foreground">
                                      {money(summary.openAmount)}
                                    </span>
                                  </>
                                )}
                              </span>
                            ) : plan.closedAt ? (
                              <span>
                                Encerrada em{" "}
                                <span className="font-medium text-foreground">
                                  {formatBrDate(plan.closedAt)}
                                </span>
                              </span>
                            ) : null}
                            {summary.nextDue && !summary.closed ? (
                              <span>
                                Próxima:{" "}
                                <span className="font-medium text-foreground">
                                  {formatBrDate(summary.nextDue.dueDate)} ·{" "}
                                  {formatParcelAmount(
                                    summary.nextDue.amount,
                                    summary.variable,
                                  )}
                                </span>
                              </span>
                            ) : null}
                          </div>
                          {summary.progress != null ? (
                            <div className="max-w-sm pt-1">
                              <Progress value={summary.progress} />
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {summary.progress}% concluído
                              </p>
                            </div>
                          ) : (
                            <p className="pt-1 text-[11px] text-muted-foreground">
                              Recorrente — encerre quando não for mais pagar
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-right">
                            <p className="text-lg font-bold tabular-nums whitespace-nowrap">
                              {summary.variable ? (
                                <>
                                  {money(summary.paidAmount)}
                                  <span className="text-xs font-normal text-muted-foreground">
                                    {" "}
                                    pago
                                  </span>
                                </>
                              ) : summary.unlimited ? (
                                <>
                                  {money(summary.monthlyAmount)}
                                  <span className="text-xs font-normal text-muted-foreground">
                                    /mês
                                  </span>
                                </>
                              ) : (
                                <>
                                  {money(summary.monthlyAmount)}
                                  <span className="text-xs font-normal text-muted-foreground">
                                    /parcela
                                  </span>
                                </>
                              )}
                            </p>
                            {!summary.unlimited && !summary.variable ? (
                              <p className="text-[11px] text-muted-foreground tabular-nums">
                                Total {money(plan.total)}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setExpanded(open ? null : item.id)
                            }
                          >
                            {open ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            Parcelas
                          </Button>
                          {cleanNotes(item.notes) ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary"
                                  aria-label="Ver notas"
                                  title="Ver notas"
                                >
                                  <StickyNote className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-80 max-w-[min(20rem,calc(100vw-2rem))]"
                              >
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                  <StickyNote className="h-4 w-4 text-primary" />
                                  Notas
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                  {cleanNotes(item.notes)}
                                </p>
                              </PopoverContent>
                            </Popover>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              {summary.unlimited && !summary.closed ? (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => closeDebt(item)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Encerrar cobrança
                                </DropdownMenuItem>
                              ) : null}
                              {summary.unlimited && summary.closed ? (
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => reopenDebt(item)}
                                >
                                  <Clock3 className="h-4 w-4" />
                                  Reabrir cobrança
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (confirm(`Excluir "${item.name}"?`)) {
                                    setData(deleteItem(data, item.id));
                                    toast.success("Dívida excluída");
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

                      <AnimatePresence initial={false}>
                        {open ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <ul className="mt-4 space-y-2 border-t pt-3">
                              {plan.installments.map((inst) => {
                                const today = format(new Date(), "yyyy-MM-dd");
                                const late =
                                  !inst.paidAt && inst.dueDate < today;
                                const isEditingAmt =
                                  editingAmount?.itemId === item.id &&
                                  editingAmount.n === inst.n;
                                return (
                                  <li
                                    key={inst.n}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                                  >
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <p className="font-medium">
                                        {summary.unlimited
                                          ? `Mensalidade #${inst.n}`
                                          : `Parcela ${inst.n}/${plan.installments.length}`}
                                      </p>
                                      {isEditingAmt ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Input
                                            className="h-8 w-28"
                                            value={editingAmount.value}
                                            onChange={(e) =>
                                              setEditingAmount({
                                                ...editingAmount,
                                                value: e.target.value,
                                              })
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                saveParcelAmount(
                                                  item,
                                                  inst.n,
                                                  editingAmount.value,
                                                );
                                              }
                                              if (e.key === "Escape") {
                                                setEditingAmount(null);
                                              }
                                            }}
                                            autoFocus
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={() =>
                                              saveParcelAmount(
                                                item,
                                                inst.n,
                                                editingAmount.value,
                                              )
                                            }
                                          >
                                            Ok
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setEditingAmount(null)
                                            }
                                          >
                                            Cancelar
                                          </Button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          className={cn(
                                            "text-left font-medium underline-offset-2 hover:underline",
                                            summary.variable &&
                                              isAmountPending(inst.amount)
                                              ? "text-warning"
                                              : "text-foreground",
                                          )}
                                          title="Clique para informar ou alterar o valor"
                                          onClick={() =>
                                            setEditingAmount({
                                              itemId: item.id,
                                              n: inst.n,
                                              value:
                                                inst.amount > 0
                                                  ? String(inst.amount)
                                                  : "",
                                            })
                                          }
                                        >
                                          {formatParcelAmount(
                                            inst.amount,
                                            summary.variable,
                                          )}
                                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                                            {summary.variable &&
                                            isAmountPending(inst.amount)
                                              ? "(preencher)"
                                              : "(editar)"}
                                          </span>
                                        </button>
                                      )}
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span>Vence</span>
                                        <Input
                                          type="date"
                                          className="h-7 w-auto text-xs"
                                          value={inst.dueDate}
                                          onChange={(e) =>
                                            saveParcelDue(
                                              item,
                                              inst.n,
                                              e.target.value,
                                            )
                                          }
                                        />
                                        {inst.paidAt
                                          ? ` · paga em ${formatBrDate(inst.paidAt)}`
                                          : late
                                            ? " · atrasada"
                                            : null}
                                      </div>
                                    </div>
                                    {inst.paidAt ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => undoParcel(item, inst.n)}
                                      >
                                        Desfazer
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => payParcel(item, inst.n)}
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                        Marcar paga
                                      </Button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {summary.lifecycle === "quitada" ? (
                              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
                                <PartyPopper className="h-4 w-4" />
                                {summary.unlimited
                                  ? "Cobrança encerrada — não gera mais mensalidades."
                                  : "Dívida concluída — todas as parcelas foram pagas."}
                              </p>
                            ) : null}
                            {summary.unlimited && !summary.closed ? (
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => closeDebt(item)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Encerrar cobrança
                                </Button>
                              </div>
                            ) : null}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar dívida" : "Nova dívida"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSave}>
            <div className="space-y-2">
              <Label htmlFor="debt-name">Descrição</Label>
              <Input
                id="debt-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Aluguel, plano de saúde, cartão…"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de cobrança</Label>
              <Select
                value={form.mode}
                onValueChange={(v) =>
                  setForm({ ...form, mode: v as DebtMode })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Parcelada (N parcelas)</SelectItem>
                  <SelectItem value="unlimited">
                    Ilimitada (recorrente)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de valor</Label>
              <Select
                value={form.amountMode}
                onValueChange={(v) => {
                  const amountMode = v as DebtAmountMode;
                  const known = Math.max(1, Number(form.currentParcel) || 1);
                  setForm({
                    ...form,
                    amountMode,
                    total: amountMode === "variable" ? "" : form.total,
                    parcelAmounts:
                      amountMode === "variable"
                        ? syncParcelAmounts(known, form.parcelAmounts, "")
                        : form.parcelAmounts,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">
                    Valor fixo (igual todo mês)
                  </SelectItem>
                  <SelectItem value="variable">
                    Valor variável (preenche mês a mês)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="debt-spent">
                  {form.mode === "unlimited" ? "Quando começou" : "Quando gastou"}
                </Label>
                <Input
                  id="debt-spent"
                  type="date"
                  value={form.spentAt}
                  onChange={(e) =>
                    setForm({ ...form, spentAt: e.target.value })
                  }
                  required
                />
              </div>
              {form.amountMode === "equal" ? (
                <div className="space-y-2">
                  <Label htmlFor="debt-total">
                    {form.mode === "unlimited"
                      ? "Valor mensal"
                      : "Valor de cada parcela"}
                  </Label>
                  <Input
                    id="debt-total"
                    value={form.total}
                    onChange={(e) =>
                      setForm({ ...form, total: e.target.value })
                    }
                    placeholder="0,00"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Valores futuros</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    Em branco — você preenche todo mês
                  </div>
                </div>
              )}
            </div>
            {form.amountMode === "equal" &&
            form.mode === "fixed" &&
            Number(form.total.replace(",", ".")) > 0 &&
            Number(form.parcels) > 0 ? (
              <p className="text-xs text-muted-foreground">
                {form.parcels}× de{" "}
                {money(Number(form.total.replace(",", ".")) || 0)}{" "}
                ({intervalLabel(Number(form.intervalMonths) || 1).toLowerCase()}
                ) ={" "}
                <span className="font-medium text-foreground">
                  {money(
                    (Number(form.total.replace(",", ".")) || 0) *
                      (Number(form.parcels) || 0),
                  )}
                </span>{" "}
                no total
              </p>
            ) : null}
            <div className="space-y-2">
              <Label>Frequência das parcelas</Label>
              <Select
                value={form.intervalMonths}
                onValueChange={(v) =>
                  setForm({ ...form, intervalMonths: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEBT_INTERVALS.map((opt) => (
                    <SelectItem key={opt.months} value={String(opt.months)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ex.: livro de curso, seguro ou mensalidade — use “A cada 6
                meses” quando não for cobrança mensal.
              </p>
            </div>
            {form.mode === "fixed" ? (
              <div className="space-y-2">
                <Label htmlFor="debt-parcels">Nº total de parcelas</Label>
                <Input
                  id="debt-parcels"
                  type="number"
                  min={1}
                  max={120}
                  value={form.parcels}
                  onChange={(e) =>
                    setForm({ ...form, parcels: e.target.value })
                  }
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Duração</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  Sem fim — você encerra quando quiser
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="debt-current">
                  {form.mode === "unlimited"
                    ? "Cobrança atual nº"
                    : "Parcela atual"}
                </Label>
                <Input
                  id="debt-current"
                  type="number"
                  min={1}
                  max={form.mode === "fixed" ? Number(form.parcels) || 120 : 240}
                  value={form.currentParcel}
                  onChange={(e) => {
                    const currentParcel = e.target.value;
                    const known = Math.max(1, Number(currentParcel) || 1);
                    setForm({
                      ...form,
                      currentParcel,
                      parcelAmounts:
                        form.amountMode === "variable"
                          ? syncParcelAmounts(known, form.parcelAmounts, "")
                          : form.parcelAmounts,
                    });
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-first">
                  Vencimento da parcela atual
                </Label>
                <Input
                  id="debt-first"
                  type="date"
                  value={form.firstDue}
                  onChange={(e) =>
                    setForm({ ...form, firstDue: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Se você já está na parcela 3, coloque <strong>3</strong> — as
              anteriores ficam como pagas. Os próximos vencimentos seguem a
              frequência escolhida (ex.: +6 meses).
            </p>
            {form.amountMode === "variable" ? (
              <div className="space-y-2">
                <Label>
                  Valores conhecidos (pagas
                  {Number(form.currentParcel) > 1 ? " + atual" : ""})
                </Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                  {syncParcelAmounts(
                    Math.max(1, Number(form.currentParcel) || 1),
                    form.parcelAmounts,
                    "",
                  ).map((value, idx) => {
                    const current = Math.max(1, Number(form.currentParcel) || 1);
                    const isPaid = idx + 1 < current;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                          {form.mode === "unlimited"
                            ? `#${idx + 1}`
                            : `${idx + 1}/${form.parcels || "?"}`}
                          {isPaid ? " paga" : " atual"}
                        </span>
                        <Input
                          value={value}
                          onChange={(e) => {
                            const next = [...form.parcelAmounts];
                            while (next.length <= idx) next.push("");
                            next[idx] = e.target.value;
                            setForm({ ...form, parcelAmounts: next });
                          }}
                          placeholder={isPaid ? "valor pago" : "opcional"}
                          required={isPaid}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  As próximas parcelas ficam em <strong>A definir</strong>. Todo
                  mês você informa o valor na lista (ou ao marcar como paga).
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="debt-notes">Notas</Label>
              <Textarea
                id="debt-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="submit">
                {editing ? "Salvar" : "Adicionar dívida"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
