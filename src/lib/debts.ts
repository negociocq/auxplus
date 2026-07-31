import { addMonths, format, parseISO } from "date-fns";
import type { DebtInstallment, DebtPlan, Item } from "@/types";

export type { DebtInstallment, DebtPlan };
export type DebtLifecycle = "atrasada" | "em_dia" | "quitada";
export type DebtMode = "fixed" | "unlimited";
export type DebtAmountMode = "equal" | "variable";

const MARKER_RE = /\n?<!--AXDEBT:([\s\S]*?)-->/;

export function stripDebtMarker(notes?: string | null): string {
  return String(notes ?? "")
    .replace(MARKER_RE, "")
    .trim();
}

export function extractDebtFromNotes(notes?: string | null): DebtPlan | null {
  const raw = String(notes ?? "");
  const m = MARKER_RE.exec(raw);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as DebtPlan;
    if (!parsed || !Array.isArray(parsed.installments)) return null;
    return ensureRecurringInstallments(normalizePlan(parsed));
  } catch {
    return null;
  }
}

export function embedDebtInNotes(
  notes: string | null | undefined,
  plan: DebtPlan | null | undefined,
): string {
  const clean = stripDebtMarker(notes);
  if (!plan) return clean;
  // Ilimitada encerrada pode ter só histórico; ainda assim salva o plano
  if (!plan.installments?.length && plan.mode !== "unlimited") return clean;
  const payload = JSON.stringify(normalizePlan(plan));
  return clean ? `${clean}\n<!--AXDEBT:${payload}-->` : `<!--AXDEBT:${payload}-->`;
}

function toYmd(value: string | null | undefined, fallback: string): string {
  const m = String(value ?? "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : fallback;
}

function ymdAddMonths(ymd: string, months: number): string {
  return format(addMonths(parseISO(toYmd(ymd, ymd)), months), "yyyy-MM-dd");
}

export function isUnlimitedPlan(plan: DebtPlan): boolean {
  return plan.mode === "unlimited" || plan.installmentCount === null;
}

export function normalizePlan(plan: DebtPlan): DebtPlan {
  const spentAt = toYmd(plan.spentAt, format(new Date(), "yyyy-MM-dd"));
  const installments = (plan.installments || [])
    .map((inst, idx) => ({
      n: Number(inst.n) || idx + 1,
      amount: Number(inst.amount) || 0,
      dueDate: toYmd(inst.dueDate, spentAt),
      paidAt: inst.paidAt ? toYmd(inst.paidAt, "") || null : null,
    }))
    .sort((a, b) => a.n - b.n);

  // unlimited só se marcado explicitamente (mode ou installmentCount === null)
  const finalMode: DebtMode =
    plan.mode === "unlimited" || plan.installmentCount === null
      ? "unlimited"
      : "fixed";

  const monthlyAmount =
    Number(plan.monthlyAmount) ||
    (finalMode === "unlimited"
      ? Number(plan.total) || installments[0]?.amount || 0
      : installments[0]?.amount ||
        (Number(plan.total) && plan.installmentCount
          ? Number(plan.total) / Number(plan.installmentCount)
          : Number(plan.total) || 0));

  const total =
    finalMode === "unlimited"
      ? monthlyAmount
      : Number(plan.total) ||
        installments.reduce((s, i) => s + i.amount, 0);

  const amountMode: DebtAmountMode =
    plan.amountMode === "variable" ? "variable" : "equal";

  return {
    spentAt,
    total: Math.round(total * 100) / 100,
    mode: finalMode,
    amountMode,
    monthlyAmount: Math.round(monthlyAmount * 100) / 100,
    installmentCount:
      finalMode === "unlimited"
        ? null
        : Number(plan.installmentCount) || installments.length || 1,
    closedAt: plan.closedAt ? toYmd(plan.closedAt, "") || null : null,
    installments,
  };
}

/**
 * Dívida ilimitada ativa: mantém parcelas mês a mês até o mês atual
 * e garante pelo menos uma em aberto (a próxima).
 */
export function ensureRecurringInstallments(plan: DebtPlan): DebtPlan {
  const normalized = normalizePlan(plan);
  if (normalized.mode !== "unlimited" || normalized.closedAt) {
    return normalized;
  }

  const defaultAmount = normalized.monthlyAmount || normalized.total || 0;
  const list = [...normalized.installments];
  const todayMonthStart = `${format(new Date(), "yyyy-MM")}-01`;
  const nextAmount = () =>
    normalized.amountMode === "variable"
      ? list[list.length - 1]?.amount || defaultAmount
      : defaultAmount;

  if (!list.length) {
    list.push({
      n: 1,
      amount: defaultAmount,
      dueDate: todayMonthStart,
      paidAt: null,
    });
  }

  let guard = 0;
  while (guard++ < 240) {
    const last = list[list.length - 1];
    // Em dia com o calendário: última parcela cobre o mês atual
    if (last.dueDate >= todayMonthStart) break;
    list.push({
      n: last.n + 1,
      amount: nextAmount(),
      dueDate: ymdAddMonths(last.dueDate, 1),
      paidAt: null,
    });
  }

  // Sempre precisa existir uma parcela em aberto enquanto não encerrar
  if (!list.some((i) => !i.paidAt)) {
    const last = list[list.length - 1];
    list.push({
      n: last.n + 1,
      amount: nextAmount(),
      dueDate: ymdAddMonths(last.dueDate, 1),
      paidAt: null,
    });
  }

  return { ...normalized, installments: list };
}

/**
 * Gera plano fixo (N parcelas) ou ilimitado (recorrente).
 * `currentParcel` = parcela/mensalidade em que você está agora (já pagas ficam 1..atual-1).
 * `firstDue` = vencimento dessa parcela atual.
 */
export function buildDebtPlan(input: {
  spentAt: string;
  /** Total (equal/fixed) ou valor mensal sugerido (ilimitado / variável) */
  amount: number;
  mode: DebtMode;
  amountMode?: DebtAmountMode;
  /** Valores por parcela (quando amountMode = variable) */
  amounts?: number[];
  count?: number;
  /** Parcela atual (1 = começando do zero) */
  currentParcel?: number;
  firstDue: string;
}): DebtPlan {
  const spentAt = toYmd(input.spentAt, format(new Date(), "yyyy-MM-dd"));
  const currentDue = toYmd(input.firstDue, spentAt);
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  const current = Math.max(1, Math.floor(input.currentParcel || 1));
  const amountMode: DebtAmountMode =
    input.amountMode === "variable" ? "variable" : "equal";

  if (input.mode === "unlimited") {
    const installments: DebtInstallment[] = [];
    for (let n = 1; n <= current; n++) {
      const dueDate = ymdAddMonths(currentDue, n - current);
      const custom = input.amounts?.[n - 1];
      installments.push({
        n,
        amount:
          custom != null && !Number.isNaN(custom)
            ? Math.round(Number(custom) * 100) / 100
            : amount,
        dueDate,
        paidAt: n < current ? dueDate : null,
      });
    }
    return ensureRecurringInstallments({
      spentAt,
      total: amount,
      mode: "unlimited",
      amountMode,
      monthlyAmount: amount,
      installmentCount: null,
      closedAt: null,
      installments,
    });
  }

  const count = Math.max(1, Math.floor(input.count || 1));
  const startAt = Math.min(current, count);

  let parts: number[];
  if (amountMode === "variable" && input.amounts?.length) {
    parts = Array.from({ length: count }, (_, idx) => {
      const v = Number(input.amounts?.[idx]);
      return Math.round((Number.isFinite(v) ? v : amount) * 100) / 100;
    });
  } else {
    const base = Math.floor((amount / count) * 100) / 100;
    parts = Array.from({ length: count }, () => base);
    const sumBase = Math.round(parts.reduce((s, v) => s + v, 0) * 100) / 100;
    const diff = Math.round((amount - sumBase) * 100) / 100;
    parts[parts.length - 1] =
      Math.round((parts[parts.length - 1] + diff) * 100) / 100;
  }

  const total = Math.round(parts.reduce((s, v) => s + v, 0) * 100) / 100;
  const installments: DebtInstallment[] = parts.map((value, idx) => {
    const n = idx + 1;
    const dueDate = ymdAddMonths(currentDue, n - startAt);
    return {
      n,
      amount: value,
      dueDate,
      paidAt: n < startAt ? dueDate : null,
    };
  });

  return {
    spentAt,
    total,
    mode: "fixed",
    amountMode,
    monthlyAmount: parts[startAt - 1] || parts[0] || 0,
    installmentCount: count,
    closedAt: null,
    installments,
  };
}

/** Altera o valor de uma parcela (e recalcula total no modo fixo). */
export function updateInstallmentAmount(
  plan: DebtPlan,
  n: number,
  amount: number,
): DebtPlan {
  const normalized = normalizePlan(plan);
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  const installments = normalized.installments.map((inst) =>
    inst.n === n ? { ...inst, amount: value } : inst,
  );
  const total =
    normalized.mode === "unlimited"
      ? normalized.monthlyAmount || value
      : Math.round(installments.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  const lastOpen =
    [...installments].reverse().find((i) => !i.paidAt) ??
    installments[installments.length - 1];

  return {
    ...normalized,
    amountMode: "variable",
    total,
    monthlyAmount:
      normalized.mode === "unlimited"
        ? lastOpen?.amount || value || normalized.monthlyAmount || 0
        : normalized.monthlyAmount,
    installments,
  };
}

/** Altera o vencimento de uma parcela. */
export function updateInstallmentDueDate(
  plan: DebtPlan,
  n: number,
  dueDate: string,
): DebtPlan {
  const normalized = normalizePlan(plan);
  const ymd = toYmd(dueDate, format(new Date(), "yyyy-MM-dd"));
  return {
    ...normalized,
    installments: normalized.installments.map((inst) =>
      inst.n === n ? { ...inst, dueDate: ymd } : inst,
    ),
  };
}

/** Plano salvo ou 1 parcela sintetizada a partir do item legado. */
export function getDebtPlan(item: Item): DebtPlan {
  const fromNotes = item.debt ?? extractDebtFromNotes(item.notes);
  if (fromNotes) {
    return ensureRecurringInstallments(normalizePlan(fromNotes));
  }

  const spentAt = toYmd(
    item.createdAt,
    toYmd(item.dueDate, format(new Date(), "yyyy-MM-dd")),
  );
  const due = toYmd(item.dueDate, spentAt);
  const total = Number(item.price) || 0;
  return {
    spentAt,
    total,
    mode: "fixed",
    monthlyAmount: total,
    installmentCount: 1,
    closedAt: null,
    installments: [{ n: 1, amount: total, dueDate: due, paidAt: null }],
  };
}

export function debtSummary(
  plan: DebtPlan,
  today = format(new Date(), "yyyy-MM-dd"),
) {
  const live = ensureRecurringInstallments(plan);
  const paid = live.installments.filter((i) => i.paidAt);
  const open = live.installments.filter((i) => !i.paidAt);
  const overdue = open.filter((i) => i.dueDate < today);
  const upcoming = open
    .filter((i) => i.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidAmount = paid.reduce((s, i) => s + i.amount, 0);
  const openAmount = open.reduce((s, i) => s + i.amount, 0);

  let lifecycle: DebtLifecycle;
  if (live.closedAt || (live.mode === "fixed" && open.length === 0)) {
    lifecycle = "quitada";
  } else if (overdue.length > 0) {
    lifecycle = "atrasada";
  } else {
    lifecycle = "em_dia";
  }

  const unlimited = live.mode === "unlimited";

  return {
    lifecycle,
    unlimited,
    closed: Boolean(live.closedAt),
    paidCount: paid.length,
    totalCount: unlimited ? null : live.installments.length,
    overdueCount: overdue.length,
    paidAmount: Math.round(paidAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    monthlyAmount: live.monthlyAmount || live.total,
    nextDue: upcoming[0] ?? null,
    progress: unlimited
      ? null
      : live.installments.length === 0
        ? 0
        : Math.round((paid.length / live.installments.length) * 100),
  };
}

export function markInstallmentPaid(
  plan: DebtPlan,
  n: number,
  paidAt = format(new Date(), "yyyy-MM-dd"),
): DebtPlan {
  let next: DebtPlan = {
    ...normalizePlan(plan),
    installments: normalizePlan(plan).installments.map((inst) =>
      inst.n === n ? { ...inst, paidAt } : inst,
    ),
  };
  if (next.mode === "unlimited" && !next.closedAt) {
    next = ensureRecurringInstallments(next);
  }
  return next;
}

export function unmarkInstallmentPaid(plan: DebtPlan, n: number): DebtPlan {
  return {
    ...normalizePlan(plan),
    installments: normalizePlan(plan).installments.map((inst) =>
      inst.n === n ? { ...inst, paidAt: null } : inst,
    ),
  };
}

/** Encerra dívida ilimitada (ex.: saiu do aluguel, cancelou o plano). */
export function closeDebtPlan(
  plan: DebtPlan,
  closedAt = format(new Date(), "yyyy-MM-dd"),
): DebtPlan {
  const normalized = normalizePlan(plan);
  return {
    ...normalized,
    closedAt,
    // Mantém histórico; parcelas futuras em aberto podem ser removidas
    installments: normalized.installments.filter(
      (i) => i.paidAt || i.dueDate <= closedAt,
    ),
  };
}

export function reopenDebtPlan(plan: DebtPlan): DebtPlan {
  return ensureRecurringInstallments({
    ...normalizePlan(plan),
    closedAt: null,
  });
}

/** Próximo vencimento em aberto (para status/dueDate do item). */
export function nextOpenDue(plan: DebtPlan): string | null {
  if (plan.closedAt) return null;
  const live = ensureRecurringInstallments(plan);
  const open = live.installments
    .filter((i) => !i.paidAt)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return open[0]?.dueDate ?? null;
}

export function withDebtOnItem(item: Item, plan: DebtPlan): Item {
  const live = ensureRecurringInstallments(plan);
  const nextDue = nextOpenDue(live);
  const cleanNotes = stripDebtMarker(item.notes);
  return {
    ...item,
    debt: live,
    price: live.mode === "unlimited" ? live.monthlyAmount || live.total : live.total,
    createdAt: live.spentAt.includes("T")
      ? live.spentAt
      : `${live.spentAt}T00:00:00`,
    dueDate: nextDue,
    notes: embedDebtInNotes(cleanNotes, live),
  };
}

/** Gastos pagos por mês (paidAt das parcelas) — dashboard de dívidas. */
export function sumDebtPaidByMonth(
  items: Item[],
  year: number,
): { name: string; total: number; itens: number }[] {
  const names = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const months = names.map((name) => ({ name, total: 0, itens: 0 }));
  for (const item of items) {
    const plan = getDebtPlan(item);
    for (const inst of plan.installments) {
      if (!inst.paidAt || !inst.paidAt.startsWith(String(year))) continue;
      const m = Number(inst.paidAt.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;
      months[m].total += inst.amount || 0;
      months[m].itens += 1;
    }
  }
  return months;
}

export function annualDebtPaid(items: Item[], year: number): number {
  return sumDebtPaidByMonth(items, year).reduce((s, m) => s + m.total, 0);
}
