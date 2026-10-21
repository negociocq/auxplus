import type { Item } from "@/types";
import { planPriceOnDate } from "@/lib/planMonths";
import { historicalIptvUsernames } from "@/lib/iptvUserAliases";
import { resolveRecreatedUsername, type UniplayRenewalEvent, type UniplayRecreatedLine, type UniplayCreditEvent } from "@/lib/uniplayRenewalLogs";

export function brazilDay(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function renewalRange(preset: string, today = brazilDay()) {
  const date = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) => { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy.toISOString().slice(0, 10); };
  if (preset === "yesterday") return { start: shift(-1), end: shift(-1) };
  if (preset === "week") return { start: shift(-((date.getUTCDay() + 6) % 7)), end: today };
  if (preset === "month") return { start: `${today.slice(0, 7)}-01`, end: today };
  return { start: today, end: today };
}

export function summarizeRenewals(items: Item[], start: string, end: string, panelEvents: UniplayRenewalEvent[] = [], includeUnmatched = true, recreations: UniplayRecreatedLine[] = [], creditOptions?: { events: UniplayCreditEvent[]; items: Item[]; unitPrice: number }) {
  const rows: { id: string; item: Item | null; username: string; currentUsername: string; recreated: boolean; paidAt: string; amount: number | null; source: "Uniplay" | "Pasta"; occurredAt: string; kind: "renewal" | "credits"; credits: number }[] = [];
  const seen = new Set<string>();
  const unmatchedUsers = new Set<string>();
  let unmatchedRenewals = 0;
  for (const event of panelEvents) {
    if (seen.has(event.id) || !Number.isFinite(Date.parse(event.occurredAt))) continue;
    seen.add(event.id);
    const paidAt = brazilDay(new Date(event.occurredAt));
    if (paidAt < start || paidAt > end) continue;
    const username = event.username.trim();
    const resolved = resolveRecreatedUsername(username, event.occurredAt, recreations);
    const directMatches = resolved.ambiguous ? [] : items.filter((item) => item.itemId?.trim().toLowerCase() === resolved.username.toLowerCase());
    const matches = directMatches.length || resolved.ambiguous ? directMatches : items.filter((item) => {
      const aliases = historicalIptvUsernames(item.notes);
      return aliases.includes(username.toLowerCase()) || aliases.includes(resolved.username.toLowerCase());
    });
    const item = matches.length === 1 ? matches[0] : null;
    if (!item) {
      unmatchedUsers.add(username);
      unmatchedRenewals++;
      if (!includeUnmatched) continue;
    }
    const amount = item ? planPriceOnDate(item, paidAt) : null;
    const currentUsername = item?.itemId || resolved.username;
    rows.push({ id: event.id, item, username, currentUsername, recreated: resolved.recreated || currentUsername.toLowerCase() !== username.toLowerCase(), paidAt, amount, source: "Uniplay", occurredAt: event.occurredAt, kind: "renewal", credits: 0 });
  }
  const seenCredits = new Set<string>();
  for (const event of creditOptions?.events || []) {
    if (seenCredits.has(event.id) || !Number.isFinite(Date.parse(event.occurredAt)) || !Number.isFinite(event.credits) || event.credits <= 0) continue;
    seenCredits.add(event.id);
    const paidAt = brazilDay(new Date(event.occurredAt));
    if (paidAt < start || paidAt > end) continue;
    const username = event.username.trim();
    const matches = creditOptions!.items.filter((item) => item.itemId?.trim().toLowerCase() === username.toLowerCase());
    const item = matches.length === 1 ? matches[0] : null;
    if (!item) {
      unmatchedUsers.add(username);
      unmatchedRenewals++;
      if (!includeUnmatched) continue;
    }
    const unit = Number(creditOptions!.unitPrice);
    const amount = Number.isFinite(unit) && unit > 0 ? Math.round(event.credits * unit * 100) / 100 : null;
    rows.push({ id: `credit:${event.id}`, item, username, currentUsername: username, recreated: false, paidAt, amount, source: "Uniplay", occurredAt: event.occurredAt, kind: "credits", credits: event.credits });
  }
  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.username.localeCompare(b.username));
  const renewals = rows.filter((row) => row.kind === "renewal");
  const creditRows = rows.filter((row) => row.kind === "credits");
  const sumAmounts = (list: typeof rows) => list.reduce((sum, row) => sum + Math.round((row.amount || 0) * 100), 0) / 100;
  return { rows, customers: new Set(rows.map((row) => row.item ? `item:${row.item.id}` : `${row.kind}:${row.currentUsername.toLowerCase()}`)).size, count: rows.length,
    renewalCount: renewals.length, creditOperations: creditRows.length, credits: creditRows.reduce((sum, row) => sum + row.credits, 0),
    renewalTotal: sumAmounts(renewals), creditTotal: sumAmounts(creditRows),
    unmatchedRenewals, unmatchedUsers: [...unmatchedUsers],
    missingAmounts: rows.filter((row) => row.amount == null).length,
    total: sumAmounts(rows) };
}
