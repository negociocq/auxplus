import { format } from "date-fns";
import type { Item } from "@/types";

const MARKER_RE = /\n?<!--AXPLAN:([\s\S]*?)-->/g;

/** Trecho de plano: vale a partir de `from` até o próximo segmento. */
export type PlanSegment = {
  /** yyyy-MM-dd — início da vigência */
  from: string;
  /** Valor cobrado do pacote (PIX) */
  price: number;
  /** Meses liberados no painel */
  planMonths: number;
};

type PlanPayload = {
  months?: number;
  segments?: PlanSegment[];
};

function toDateKey(value?: string | null): string | null {
  if (value == null || value === "") return null;
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function roundMoney(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clampMonths(n: unknown, fallback = 1) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(24, v);
}

export function stripPlanMarker(notes?: string | null): string {
  return String(notes ?? "")
    .replace(MARKER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parsePlanPayload(notes?: string | null): PlanPayload | null {
  const m = /<!--AXPLAN:([\s\S]*?)-->/.exec(String(notes ?? ""));
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as PlanPayload;
  } catch {
    return null;
  }
}

/** Tem segmentos gravados (histórico real), não só `{ months: N }`. */
function hasPersistedSegments(notes?: string | null): boolean {
  const payload = parsePlanPayload(notes);
  return Boolean(
    payload &&
      Array.isArray(payload.segments) &&
      payload.segments.some((s) => normalizeSegment(s)),
  );
}

/**
 * Pacote multi-mês com um único segmento começando depois da criação
 * (bug da 1ª configuração) → vigência desde "Criado em".
 */
function rebaseInitialPackageFromCreated(
  segments: PlanSegment[],
  createdAt?: string | null,
): PlanSegment[] {
  if (segments.length !== 1) return segments;
  const created = toDateKey(createdAt);
  if (!created) return segments;
  const only = segments[0];
  if (only.planMonths <= 1) return segments;
  if (only.from <= created) return segments;
  return [{ ...only, from: created }];
}

function normalizeSegment(raw: Partial<PlanSegment> | null | undefined): PlanSegment | null {
  if (!raw) return null;
  const from = toDateKey(raw.from);
  if (!from) return null;
  const price = roundMoney(raw.price);
  const planMonths = clampMonths(raw.planMonths, 1);
  if (price < 0) return null;
  return { from, price, planMonths };
}

export function extractPlanMonths(notes?: string | null): number | null {
  const payload = parsePlanPayload(notes);
  if (!payload) return null;
  if (Array.isArray(payload.segments) && payload.segments.length) {
    const last = normalizeSegment(payload.segments[payload.segments.length - 1]);
    if (last) return last.planMonths;
  }
  const n = clampMonths(payload.months, 0);
  return n >= 1 ? n : null;
}

/** Mensalidade usada no gráfico (pacote ÷ meses). */
export function planMonthlyAmount(price: number, planMonths: number): number {
  const p = roundMoney(price);
  const m = clampMonths(planMonths, 1);
  if (p <= 0) return 0;
  if (m <= 1) return p;
  return roundMoney(p / m);
}

/**
 * Histórico de planos do cliente.
 * Sem marcador: sintetiza 1 segmento desde a criação com preço/meses atuais
 * (ainda não “congela” o passado até a primeira gravação/alteração).
 */
export function getPlanSegments(
  item: Pick<Item, "price" | "planMonths" | "notes" | "createdAt" | "planHistory">,
): PlanSegment[] {
  if (Array.isArray(item.planHistory) && item.planHistory.length) {
    const cleaned = item.planHistory
      .map((s) => normalizeSegment(s))
      .filter((s): s is PlanSegment => Boolean(s))
      .sort((a, b) => a.from.localeCompare(b.from));
    if (cleaned.length) {
      return rebaseInitialPackageFromCreated(cleaned, item.createdAt);
    }
  }

  const payload = parsePlanPayload(item.notes);
  if (payload?.segments?.length) {
    const cleaned = payload.segments
      .map((s) => normalizeSegment(s))
      .filter((s): s is PlanSegment => Boolean(s))
      .sort((a, b) => a.from.localeCompare(b.from));
    if (cleaned.length) {
      return rebaseInitialPackageFromCreated(cleaned, item.createdAt);
    }
  }

  const from =
    toDateKey(item.createdAt) || format(new Date(), "yyyy-MM-dd");
  const planMonths = getPlanMonths(item, 1);
  return [
    {
      from,
      price: roundMoney(item.price),
      planMonths,
    },
  ];
}

/**
 * Ao criar/atualizar:
 * - 1º pacote multi-mês (ex. 3×130): vale desde a criação (43,33/mês no gráfico)
 * - mudanças depois disso: novo segmento a partir de hoje (passado intacto)
 */
export function resolvePlanSegmentsOnSave(
  previous: Pick<
    Item,
    "price" | "planMonths" | "notes" | "createdAt" | "planHistory"
  > | null | undefined,
  next: Pick<Item, "price" | "planMonths" | "createdAt">,
  changeDate: string = format(new Date(), "yyyy-MM-dd"),
): PlanSegment[] {
  const created =
    toDateKey(next.createdAt) ||
    toDateKey(previous?.createdAt) ||
    changeDate;
  const nextPrice = roundMoney(next.price);
  const nextMonths = clampMonths(next.planMonths, 1);
  const today = toDateKey(changeDate) || format(new Date(), "yyyy-MM-dd");

  if (!previous) {
    return [{ from: created, price: nextPrice, planMonths: nextMonths }];
  }

  const persisted = hasPersistedSegments(previous.notes);
  const prevPrice = roundMoney(previous.price);
  const prevMonths = getPlanMonths(previous, 1);

  // Ainda sem histórico de segmentos gravado
  if (!persisted) {
    // 1ª vez no pacote multi-mês → aplica desde a criação
    if (nextMonths > 1 && prevMonths <= 1) {
      return [{ from: created, price: nextPrice, planMonths: nextMonths }];
    }
    // Já era multi-mês (só campo months) e mantém → congela desde a criação
    if (
      nextMonths > 1 &&
      prevMonths > 1 &&
      nextPrice === prevPrice &&
      nextMonths === prevMonths
    ) {
      return [{ from: created, price: nextPrice, planMonths: nextMonths }];
    }
    // Mudança com histórico só sintético: antigo desde criação + novo a partir de hoje
    if (nextPrice !== prevPrice || nextMonths !== prevMonths) {
      if (today === created) {
        return [{ from: created, price: nextPrice, planMonths: nextMonths }];
      }
      return [
        { from: created, price: prevPrice, planMonths: prevMonths },
        { from: today, price: nextPrice, planMonths: nextMonths },
      ];
    }
    return [{ from: created, price: nextPrice, planMonths: nextMonths }];
  }

  const segs = rebaseInitialPackageFromCreated(
    getPlanSegments(previous),
    previous.createdAt ?? next.createdAt,
  );
  const last = segs[segs.length - 1];
  if (
    last &&
    roundMoney(last.price) === nextPrice &&
    last.planMonths === nextMonths
  ) {
    return segs;
  }

  if (last && last.from === today) {
    return [
      ...segs.slice(0, -1),
      { from: today, price: nextPrice, planMonths: nextMonths },
    ];
  }
  return [...segs, { from: today, price: nextPrice, planMonths: nextMonths }];
}

export function embedPlanState(
  notes: string | null | undefined,
  planMonths: number,
  segments: PlanSegment[],
): string {
  const clean = stripPlanMarker(notes);
  const months = clampMonths(planMonths, 1);
  const normalized = segments
    .map((s) => normalizeSegment(s))
    .filter((s): s is PlanSegment => Boolean(s))
    .sort((a, b) => a.from.localeCompare(b.from));

  // Só omite marcador se for plano mensal simples sem histórico de mudanças
  if (normalized.length <= 1 && months <= 1) {
    return clean;
  }

  const payload: PlanPayload = {
    months,
    segments: normalized.length
      ? normalized
      : [
          {
            from: format(new Date(), "yyyy-MM-dd"),
            price: 0,
            planMonths: months,
          },
        ],
  };
  const raw = JSON.stringify(payload);
  return clean ? `${clean}\n<!--AXPLAN:${raw}-->` : `<!--AXPLAN:${raw}-->`;
}

/** @deprecated use embedPlanState */
export function embedPlanMonths(
  notes: string | null | undefined,
  months: number,
): string {
  return embedPlanState(notes, months, []);
}

/** Meses do plano atual do cliente (1–24). */
export function getPlanMonths(
  item: Pick<Item, "planMonths" | "notes" | "planHistory">,
  fallback = 1,
): number {
  if (
    item.planMonths != null &&
    Number.isFinite(Number(item.planMonths)) &&
    Number(item.planMonths) >= 1
  ) {
    return clampMonths(item.planMonths, fallback);
  }
  const segs = Array.isArray(item.planHistory) ? item.planHistory : null;
  if (segs?.length) {
    const last = normalizeSegment(segs[segs.length - 1]);
    if (last) return last.planMonths;
  }
  const fromNotes = extractPlanMonths(item.notes);
  if (fromNotes != null) return fromNotes;
  return clampMonths(fallback, 1);
}

export function withPlanMonths(item: Item, months: number): Item {
  const n = clampMonths(months, 1);
  const segments = resolvePlanSegmentsOnSave(item, {
    ...item,
    planMonths: n,
  });
  return {
    ...item,
    planMonths: n,
    planHistory: segments,
    notes: embedPlanState(item.notes, n, segments),
  };
}

/**
 * Mensalidade vigente em um mês (yyyy-MM) para o gráfico anual.
 * Usa o último segmento com início ≤ esse mês.
 */
export function planMonthlyInMonth(
  item: Pick<
    Item,
    "price" | "planMonths" | "notes" | "createdAt" | "planHistory"
  >,
  monthKey: string,
): number {
  const key = String(monthKey || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  const segs = getPlanSegments(item);
  let active = segs[0];
  for (const s of segs) {
    if (s.from.slice(0, 7) <= key) active = s;
  }
  return planMonthlyAmount(active?.price ?? 0, active?.planMonths ?? 1);
}

/**
 * Valor do PIX = preço do plano cadastrado (pacote completo).
 * Ex.: 3 meses por R$ 130 → price=130; `months` só define a renovação no painel.
 */
export function planPixAmount(packagePrice: number, _months?: number): number {
  const value = roundMoney(packagePrice);
  if (value <= 0) return 0;
  return value;
}

/**
 * Em qual mês do plano o cliente está (ex.: 2/3), com base no vencimento.
 * 1/3 = começo do ciclo · 3/3 = último mês · vencido = total/total.
 */
export function planCycleProgress(
  item: Pick<Item, "planMonths" | "notes" | "planHistory" | "dueDate">,
  now: Date = new Date(),
): { current: number; total: number; label: string } | null {
  const total = getPlanMonths(item, 1);
  if (total <= 1) return null;
  const dueKey = toDateKey(item.dueDate);
  if (!dueKey) return null;

  const due = parseLocalYmd(dueKey);
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const dueY = due.getFullYear();
  const dueM = due.getMonth();

  // Meses restantes até o vencimento (incluindo o mês atual)
  let monthsLeft = (dueY - nowY) * 12 + (dueM - nowM) + 1;
  if (monthsLeft < 0) monthsLeft = 0;

  let current: number;
  if (monthsLeft <= 0) {
    current = total; // já venceu → último mês do ciclo
  } else if (monthsLeft >= total) {
    current = 1; // ainda no começo (ou vencimento além do plano)
  } else {
    current = total - monthsLeft + 1;
  }

  if (current < 1) current = 1;
  if (current > total) current = total;

  return {
    current,
    total,
    label: `${current}/${total}`,
  };
}

function parseLocalYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
