import type { Item } from "@/types";
import type { lookupUniplayRenewals } from "@/lib/uniplayRenewalLookup";
import { summarizeRenewals } from "@/lib/renewalSummary";
import { summarizeFolderRenewals } from "@/lib/folderRenewalSummary";
import { planMonthlyInMonth } from "@/lib/planMonths";

export type ReceivedOperationsData = Awaited<ReturnType<typeof lookupUniplayRenewals>>;

/** Fonte e regras compartilhadas pelo relatório e pelo gráfico mensal. */
export function summarizeReceivedOperations(items: Item[], start: string, end: string, data: ReceivedOperationsData, resellersFolderId: string, folderId = "all") {
  const filtered = items.filter((item) => folderId === "all" || item.folderId === folderId);
  if (data.source === "folders") return summarizeFolderRenewals(filtered, start, end, resellersFolderId);
  return summarizeRenewals(filtered.filter((item) => item.folderId !== resellersFolderId), start, end,
    folderId !== resellersFolderId ? data.events : [], folderId === "all", data.recreations, {
      events: folderId === "all" || folderId === resellersFolderId ? data.creditEvents : [],
      items: filtered.filter((item) => item.folderId === resellersFolderId), unitPrice: data.creditUnitPrice,
    });
}

export function receivedOperationsByMonth(items: Item[], year: number, today: string, data: ReceivedOperationsData, resellersFolderId: string, folderId = "all") {
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const scoped = items.filter((item) => folderId === "all" || item.folderId === folderId);
  const slimHistory = (item: Item) => {
    const label = String(item.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const jessica = label.includes("jessica") && label.includes("andressa");
    const jones = /(^|\s)jones(\s|$)/i.test(label);
    if (!jessica && !jones || !item.createdAt || !(Number(item.price) > 0)) return null;
    const created = String(item.createdAt).slice(0, 7);
    const firstUniPlay = jones
      ? (data.events || []).filter((event) => String(event.username || "").trim().toLowerCase() === String(item.itemId || "").trim().toLowerCase()).map((event) => String(event.occurredAt || "").slice(0, 7)).filter(Boolean).sort()[0]
      : null;
    return { created, end: jessica ? today.slice(0, 7) : firstUniPlay || today.slice(0, 7) };
  };
  return names.map((name, index) => {
    const start = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const last = `${year}-${String(index + 1).padStart(2, "0")}-${new Date(Date.UTC(year, index + 1, 0)).getUTCDate()}`;
    const end = last < today ? last : today;
    const result = summarizeReceivedOperations(items, start, end, data, resellersFolderId, folderId);
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    let historicalTotal = 0;
    let historicalCount = 0;
    for (const item of scoped) {
      const history = slimHistory(item);
      if (!history || month < history.created || month >= history.end || month > today.slice(0, 7)) continue;
      historicalTotal += planMonthlyInMonth(item, month);
      historicalCount += 1;
    }
    return { name, total: Math.round((result.total + historicalTotal) * 100) / 100, itens: result.count + historicalCount, missingAmounts: result.missingAmounts };
  });
}
