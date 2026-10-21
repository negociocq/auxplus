import type { Item } from "@/types";
import { getRecordedPayments } from "@/lib/payments";
import { brazilDay, summarizeRenewals } from "@/lib/renewalSummary";

/** Sem Uniplay: somente pagamentos gravados, sem projetar meses pelo vencimento. */
export function summarizeFolderRenewals(items: Item[], start: string, end: string, resellersFolderId = "") {
  const result = summarizeRenewals([], start, end);
  const seen = new Set<string>();
  for (const item of items) {
    getRecordedPayments(item).forEach((payment, index) => {
      if (payment.kind === "initial" || payment.kind === "estimated") return;
      const rawDate = String(payment.paidAt || "");
      const parsed = new Date(rawDate);
      if (!Number.isFinite(parsed.getTime())) return;
      const paidAt = rawDate.includes("T") ? brazilDay(parsed) : rawDate.slice(0, 10);
      if (paidAt < start || paidAt > end) return;
      // Registros antigos sem tipo no dia do cadastro podem ser o pagamento inicial.
      if (!payment.kind && !payment.paymentId && paidAt === item.createdAt?.slice(0, 10)) return;
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount) || amount < 0) return;
      const id = payment.paymentId ? `payment:${payment.paymentId}` : `folder:${item.id}:${index}`;
      if (seen.has(id)) return;
      seen.add(id);
      result.rows.push({ id, item, username: item.itemId, currentUsername: item.itemId, recreated: false, paidAt, occurredAt: `${paidAt}T12:00:00-03:00`, amount: Math.round(amount * 100) / 100, source: "Pasta", kind: item.folderId === resellersFolderId ? "credits" : "renewal", credits: 0 });
    });
  }
  result.rows.sort((a, b) => b.paidAt.localeCompare(a.paidAt) || a.username.localeCompare(b.username));
  result.count = result.rows.length;
  result.customers = new Set(result.rows.map((row) => row.item!.id)).size;
  result.renewalCount = result.rows.filter((row) => row.kind === "renewal").length;
  result.creditOperations = result.count - result.renewalCount;
  const sum = (kind: "renewal" | "credits") => result.rows.filter((row) => row.kind === kind).reduce((total, row) => total + Math.round(row.amount! * 100), 0) / 100;
  result.renewalTotal = sum("renewal");
  result.creditTotal = sum("credits");
  result.total = Math.round((result.renewalTotal + result.creditTotal) * 100) / 100;
  return result;
}
