import { format } from "date-fns";
import type { Item, ItemPayment } from "@/types";

export type { ItemPayment };

const MARKER_RE = /\n?<!--AXPAY:([\s\S]*?)-->/;

export function stripPaymentMarker(notes?: string | null): string {
  return String(notes ?? "")
    .replace(MARKER_RE, "")
    .trim();
}

export function extractPaymentsFromNotes(
  notes?: string | null,
): ItemPayment[] {
  const raw = String(notes ?? "");
  const m = MARKER_RE.exec(raw);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]) as ItemPayment[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.paidAt === "string")
      .map((p) => ({
        paidAt: String(p.paidAt).slice(0, 10),
        amount: Number(p.amount) || 0,
      }));
  } catch {
    return [];
  }
}

export function embedPaymentsInNotes(
  notes: string | null | undefined,
  payments: ItemPayment[],
): string {
  const clean = stripPaymentMarker(notes);
  if (!payments.length) return clean;
  const payload = JSON.stringify(
    payments.map((p) => ({
      paidAt: p.paidAt.slice(0, 10),
      amount: Number(p.amount) || 0,
    })),
  );
  return clean
    ? `${clean}\n<!--AXPAY:${payload}-->`
    : `<!--AXPAY:${payload}-->`;
}

/** Pagamentos do item (histórico) ou fallback: 1º pagamento na criação. */
export function getItemPayments(item: Item): ItemPayment[] {
  const fromField = item.payments?.length
    ? item.payments
    : extractPaymentsFromNotes(item.notes);
  if (fromField.length) return fromField;

  // Sem histórico: conta só o ciclo atual (vencimento), não espalha nos meses intermediários
  const paidAt = String(item.dueDate || item.createdAt || "").slice(0, 10);
  if (!paidAt) return [];
  return [{ paidAt, amount: item.price || 0 }];
}

export function withEmbeddedPayments(item: Item): Item {
  const payments = getItemPayments(item);
  return {
    ...item,
    payments,
    notes: embedPaymentsInNotes(stripPaymentMarker(item.notes), payments),
  };
}

/**
 * Ao avançar a data de vencimento (= renovação):
 * - garante o ciclo anterior (due antigo) no histórico
 * - registra novo pagamento na data de hoje
 * Meses sem renovar ficam zerados no gráfico.
 */
export function paymentsAfterDueChange(
  previous: Item,
  next: Item,
): ItemPayment[] {
  const payments = [...getItemPayments(previous)];
  const oldDue = previous.dueDate ? previous.dueDate.slice(0, 10) : null;
  const newDue = next.dueDate ? next.dueDate.slice(0, 10) : null;
  const amount = next.price || previous.price || 0;

  if (oldDue && newDue && newDue > oldDue) {
    const oldMonth = oldDue.slice(0, 7);
    if (!payments.some((p) => p.paidAt.slice(0, 7) === oldMonth)) {
      payments.push({ paidAt: oldDue, amount: previous.price || amount });
    }
    const today = format(new Date(), "yyyy-MM-dd");
    const sameDay = payments.findIndex((p) => p.paidAt === today);
    if (sameDay >= 0) payments[sameDay] = { paidAt: today, amount };
    else payments.push({ paidAt: today, amount });
  }

  return payments;
}

export function paymentsForNewItem(item: Omit<Item, "id" | "status"> | Item): ItemPayment[] {
  const paidAt = String(item.createdAt || new Date().toISOString()).slice(
    0,
    10,
  );
  return [{ paidAt, amount: item.price || 0 }];
}

function parseLocalYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Extrai YYYY-MM-DD de string ISO/timestamp (evita deslocar dia por fuso). */
function toDateKey(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Totais mensais (Cliente/Produto = lucro):
 * conta do mês de criação até o mês do vencimento (inclusive).
 * No mês atual, já vencidos (due < hoje) não entram.
 * Meses depois do vencimento ficam zerados para esse item.
 */
export function sumPaymentsByMonth(
  items: Item[],
  year: number,
  now: Date = new Date(),
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
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const endOfSelectedYear = new Date(year, 11, 31, 23, 59, 59, 999);
  const yearLoopEnd =
    endOfSelectedYear.getTime() > now.getTime() ? endOfSelectedYear : now;

  for (const item of items) {
    const dueRaw = toDateKey(item.dueDate);
    if (!dueRaw) continue;

    const createdRaw = toDateKey(item.createdAt) ?? "2020-01-01";
    const price = Number(item.price) || 0;
    const dueDate = parseLocalYmd(dueRaw);
    const dueMonthKey = dueRaw.slice(0, 7);
    // Para no mês do vencimento (não conta depois de vencido)
    const dueMonthEnd = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const loopEnd = new Date(
      Math.min(yearLoopEnd.getTime(), dueMonthEnd.getTime()),
    );
    let cursor = parseLocalYmd(createdRaw);

    while (cursor.getTime() <= loopEnd.getTime()) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;

      if (y === year && monthKey <= dueMonthKey) {
        let include = true;
        if (monthKey === currentMonthKey) {
          // Já vencido hoje não entra no mês corrente
          include = dueRaw >= todayStr;
        }
        if (include) {
          months[m].total += price;
          months[m].itens += 1;
        }
      }

      cursor = new Date(y, m + 1, 1);
    }
  }

  return months;
}

export function annualPaymentBalance(
  items: Item[],
  year: number,
  now: Date = new Date(),
): number {
  return sumPaymentsByMonth(items, year, now).reduce((s, m) => s + m.total, 0);
}
