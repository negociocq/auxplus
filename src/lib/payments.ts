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

/**
 * Totais mensais iguais ao legacy/items.php:
 * do mês de created_at até o mês atual, soma o preço se o vencimento
 * ainda cobria aquele mês (meses passados: due >= 1º do mês;
 * mês atual: due >= agora).
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

  for (const item of items) {
    const createdRaw = item.createdAt
      ? String(item.createdAt).slice(0, 10)
      : null;
    const dueRaw = item.dueDate ? String(item.dueDate).slice(0, 10) : null;
    if (!createdRaw || !dueRaw) continue;

    const price = Number(item.price) || 0;
    const dueDate = parseLocalYmd(dueRaw);
    let cursor = parseLocalYmd(createdRaw);

    while (cursor.getTime() <= now.getTime()) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;

      if (y === year) {
        let include = false;
        if (monthKey < currentMonthKey) {
          include = dueRaw >= `${monthKey}-01`;
        } else if (monthKey === currentMonthKey) {
          // PHP: $due_date >= new DateTime()
          include = dueDate.getTime() >= now.getTime();
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
