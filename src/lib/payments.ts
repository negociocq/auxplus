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

/** Soma valores por mês com base nos pagamentos (não espalha entre criação e due). */
export function sumPaymentsByMonth(
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
    for (const pay of getItemPayments(item)) {
      if (!pay.paidAt.startsWith(String(year))) continue;
      const month = Number(pay.paidAt.slice(5, 7)) - 1;
      if (month < 0 || month > 11) continue;
      months[month].total += pay.amount || 0;
      months[month].itens += 1;
    }
  }
  return months;
}

export function annualPaymentBalance(items: Item[], year: number): number {
  return sumPaymentsByMonth(items, year).reduce((s, m) => s + m.total, 0);
}
