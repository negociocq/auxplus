import { addMonths, format, parseISO } from "date-fns";
import type { DebtInstallment, DebtPlan, Item } from "@/types";

export type { DebtInstallment, DebtPlan };
export type DebtLifecycle = "atrasada" | "em_dia" | "quitada";
export type DebtMode = "fixed" | "unlimited";
export type DebtAmountMode = "equal" | "variable";

/** Intervalos comuns entre parcelas (em meses). */
export const DEBT_INTERVALS = [
  { months: 1, label: "Todo mês" },
  { months: 2, label: "A cada 2 meses" },
  { months: 3, label: "A cada 3 meses" },
  { months: 6, label: "A cada 6 meses" },
  { months: 12, label: "Uma vez ao ano" },
] as const;

export function clampIntervalMonths(value?: number | null): number {
  const n = Math.floor(Number(value) || 1);
  if (n <= 1) return 1;
  if (n >= 12) return 12;
  return n;
}

export function intervalLabel(months?: number | null): string {
  const m = clampIntervalMonths(months);
  const found = DEBT_INTERVALS.find((i) => i.months === m);
  return found?.label ?? `A cada ${m} meses`;
}

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
  const intervalMonths = clampIntervalMonths(plan.intervalMonths);

  return {
    spentAt,
    total: Math.round(total * 100) / 100,
    mode: finalMode,
    amountMode,
    intervalMonths,
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
  const interval = clampIntervalMonths(normalized.intervalMonths);
  const list = [...normalized.installments];
  const today = format(new Date(), "yyyy-MM-dd");
  // Variável: ciclo novo começa sem valor — a pessoa preenche
  const nextAmount = () =>
    normalized.amountMode === "variable" ? 0 : defaultAmount;

  if (!list.length) {
    list.push({
      n: 1,
      amount: nextAmount() || defaultAmount,
      dueDate: today,
      paidAt: null,
    });
  }

  let guard = 0;
  while (guard++ < 240) {
    const last = list[list.length - 1];
    // Em dia com o calendário: última cobrança ainda cobre até hoje
    if (last.dueDate >= today) break;
    list.push({
      n: last.n + 1,
      amount: nextAmount(),
      dueDate: ymdAddMonths(last.dueDate, interval),
      paidAt: null,
    });
  }

  // Sempre precisa existir uma parcela em aberto enquanto não encerrar
  if (!list.some((i) => !i.paidAt)) {
    const last = list[list.length - 1];
    list.push({
      n: last.n + 1,
      amount: nextAmount(),
      dueDate: ymdAddMonths(last.dueDate, interval),
      paidAt: null,
    });
  }

  return { ...normalized, installments: list };
}

/**
 * Gera plano fixo (N parcelas) ou ilimitado (recorrente).
 * `currentParcel` = parcela/mensalidade em que você está agora (já pagas ficam 1..atual-1).
 * `firstDue` = vencimento dessa parcela atual.
 * Em modo equal + parcelada: `amount` = valor de CADA parcela (ex.: 36× de R$ 589,38).
 */
export function buildDebtPlan(input: {
  spentAt: string;
  /**
   * Equal + parcelada: valor de cada parcela.
   * Equal + ilimitada: valor mensal.
   * Variável: fallback só para parcelas já pagas sem valor no form.
   */
  amount: number;
  mode: DebtMode;
  amountMode?: DebtAmountMode;
  /** Valores por parcela (quando amountMode = variable) */
  amounts?: number[];
  count?: number;
  /** Parcela atual (1 = começando do zero) */
  currentParcel?: number;
  firstDue: string;
  /** Espaçamento entre parcelas (1 = mensal, 6 = semestral…) */
  intervalMonths?: number;
}): DebtPlan {
  const spentAt = toYmd(input.spentAt, format(new Date(), "yyyy-MM-dd"));
  const currentDue = toYmd(input.firstDue, spentAt);
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  const current = Math.max(1, Math.floor(input.currentParcel || 1));
  const amountMode: DebtAmountMode =
    input.amountMode === "variable" ? "variable" : "equal";
  const interval = clampIntervalMonths(input.intervalMonths);

  if (input.mode === "unlimited") {
    const installments: DebtInstallment[] = [];
    for (let n = 1; n <= current; n++) {
      const dueDate = ymdAddMonths(currentDue, (n - current) * interval);
      const custom = input.amounts?.[n - 1];
      const hasCustom = custom != null && Number.isFinite(Number(custom));
      const value = hasCustom
        ? Math.round(Number(custom) * 100) / 100
        : amountMode === "variable"
          ? n < current
            ? amount
            : 0
          : amount;
      installments.push({
        n,
        amount: value,
        dueDate,
        paidAt: n < current ? dueDate : null,
      });
    }
    return ensureRecurringInstallments({
      spentAt,
      total: amount,
      mode: "unlimited",
      amountMode,
      intervalMonths: interval,
      monthlyAmount: amount,
      installmentCount: null,
      closedAt: null,
      installments,
    });
  }

  const count = Math.max(1, Math.floor(input.count || 1));
  const startAt = Math.min(current, count);

  let parts: number[];
  if (amountMode === "variable") {
    // Só usa valor informado; futuras ficam 0 (a definir) — sem rateio fantasma
    parts = Array.from({ length: count }, (_, idx) => {
      const n = idx + 1;
      const raw = input.amounts?.[idx];
      const has = raw != null && Number.isFinite(Number(raw));
      const v = has ? Math.round(Number(raw) * 100) / 100 : null;
      if (v != null && v > 0) return v;
      // Parcelas já pagas sem valor no form: fallback do campo total
      if (n < startAt) return amount > 0 ? amount : 0;
      return 0;
    });
  } else {
    // Valor fixo = mesma parcela a cada ciclo (não divide o total)
    const installment = amount;
    parts = Array.from({ length: count }, () => installment);
  }

  const total = Math.round(parts.reduce((s, v) => s + v, 0) * 100) / 100;
  const installments: DebtInstallment[] = parts.map((value, idx) => {
    const n = idx + 1;
    const dueDate = ymdAddMonths(currentDue, (n - startAt) * interval);
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
    intervalMonths: interval,
    monthlyAmount:
      amountMode === "equal"
        ? amount
        : parts[startAt - 1] || parts.find((p) => p > 0) || 0,
    installmentCount: count,
    closedAt: null,
    installments,
  };
}

/** Valor ainda não informado (renda variável). */
export function isAmountPending(amount: number | null | undefined): boolean {
  return !(Number(amount) > 0);
}

/**
 * Corrige planos variáveis antigos em que o rateio deixou o mesmo
 * valor residual em todas as parcelas em aberto (ex.: R$ 10,84).
 */
export function scrubVariableGhostAmounts(plan: DebtPlan): DebtPlan {
  const normalized = normalizePlan(plan);
  if (normalized.amountMode !== "variable") return normalized;

  const paid = normalized.installments.filter(
    (i) => i.paidAt && i.amount > 0,
  );
  const open = normalized.installments.filter((i) => !i.paidAt);
  if (paid.length < 1 || open.length < 2) return normalized;

  const avgPaid =
    paid.reduce((s, i) => s + i.amount, 0) / paid.length;
  const ghost = open[0].amount;
  const allSame = open.every((i) => i.amount === ghost);
  // Residual típico do rateio: igual em todas e bem menor que o que já pagou
  if (!allSame || !(ghost > 0) || ghost >= avgPaid * 0.35) {
    return normalized;
  }

  const installments = normalized.installments.map((i) =>
    i.paidAt ? i : { ...i, amount: 0 },
  );
  const total =
    Math.round(installments.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  return { ...normalized, installments, total };
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
    return scrubVariableGhostAmounts(
      ensureRecurringInstallments(normalizePlan(fromNotes)),
    );
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
  const live = scrubVariableGhostAmounts(ensureRecurringInstallments(plan));
  const paid = live.installments.filter((i) => i.paidAt);
  const open = live.installments.filter((i) => !i.paidAt);
  const overdue = open.filter((i) => i.dueDate < today);
  const upcoming = open
    .filter((i) => i.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidAmount = paid.reduce((s, i) => s + i.amount, 0);
  const openAmount = open.reduce((s, i) => s + i.amount, 0);
  const pendingCount = open.filter((i) => isAmountPending(i.amount)).length;

  let lifecycle: DebtLifecycle;
  if (live.closedAt || (live.mode === "fixed" && open.length === 0)) {
    lifecycle = "quitada";
  } else if (overdue.length > 0) {
    lifecycle = "atrasada";
  } else {
    lifecycle = "em_dia";
  }

  const unlimited = live.mode === "unlimited";
  const variable = live.amountMode === "variable";

  return {
    lifecycle,
    unlimited,
    variable,
    closed: Boolean(live.closedAt),
    paidCount: paid.length,
    totalCount: unlimited ? null : live.installments.length,
    overdueCount: overdue.length,
    pendingCount,
    paidAmount: Math.round(paidAmount * 100) / 100,
    openAmount: Math.round(openAmount * 100) / 100,
    monthlyAmount: live.monthlyAmount || live.total,
    nextDue: upcoming[0] ?? open[0] ?? null,
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
  const live = scrubVariableGhostAmounts(ensureRecurringInstallments(plan));
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
