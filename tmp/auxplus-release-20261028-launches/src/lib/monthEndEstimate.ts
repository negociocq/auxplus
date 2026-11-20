import type { Item } from "@/types";
import type { summarizeRenewals } from "@/lib/renewalSummary";
import { planPriceOnDate } from "@/lib/planMonths";
import { historicalIptvUsernames } from "@/lib/iptvUserAliases";

/** Projeção do mês atual: realizado + clientes ainda pendentes com vencimento neste mês. */
export function estimateMonthEnd(items: Item[], today: string, recorded: ReturnType<typeof summarizeRenewals>, resellersFolderId = "") {
  const start = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);
  const end = `${today.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  const renewedIds = new Set(recorded.rows.filter((row) => row.kind === "renewal" && row.item).map((row) => row.item!.id));
  const renewedLogins = new Set(recorded.rows.filter((row) => row.kind === "renewal").flatMap((row) => [row.username.toLowerCase(), row.currentUsername.toLowerCase()]));
  const seen = new Set<string>();
  const pending: { item: Item; dueDate: string; amount: number | null }[] = [];
  for (const item of items) {
    if (item.folderId === resellersFolderId || item.isActive === false || renewedIds.has(item.id)) continue;
    const dueDate = String(item.dueDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < start || dueDate > end) continue;
    const logins = [item.itemId.trim().toLowerCase(), ...historicalIptvUsernames(item.notes)].filter(Boolean);
    if (logins.some((login) => renewedLogins.has(login))) continue;
    const key = item.itemId.trim().toLowerCase() || `id:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amount = planPriceOnDate(item, dueDate > today ? dueDate : today);
    if (amount === 0) continue;
    pending.push({ item, dueDate, amount });
  }
  pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.item.name.localeCompare(b.item.name));
  const pendingTotal = pending.reduce((sum, row) => sum + Math.round((row.amount || 0) * 100), 0) / 100;
  return { pending, pendingCount: pending.length, overdueCount: pending.filter((row) => row.dueDate < today).length, pendingTotal,
    total: (Math.round(recorded.total * 100) + Math.round(pendingTotal * 100)) / 100,
    missingAmounts: recorded.missingAmounts + pending.filter((row) => row.amount == null).length, end };
}
