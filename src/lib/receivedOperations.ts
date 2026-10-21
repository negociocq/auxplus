import type { Item } from "@/types";
import type { lookupUniplayRenewals } from "@/lib/uniplayRenewalLookup";
import { summarizeRenewals } from "@/lib/renewalSummary";
import { summarizeFolderRenewals } from "@/lib/folderRenewalSummary";

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
  return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((name, index) => {
    const start = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const last = `${year}-${String(index + 1).padStart(2, "0")}-${new Date(Date.UTC(year, index + 1, 0)).getUTCDate()}`;
    const end = last < today ? last : today;
    const result = summarizeReceivedOperations(items, start, end, data, resellersFolderId, folderId);
    return { name, total: result.total, itens: result.count, missingAmounts: result.missingAmounts };
  });
}
