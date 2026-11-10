import { loadAutomationsConfigRemote, isUniplayConnected } from "@/lib/automationsConfig";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import { ensureIptvToken, listUniplayRenewalLogs, listUniplayCreditLogs } from "@/lib/iptvPanelApi";
import { brazilDay } from "@/lib/renewalSummary";
import type { UniplayRenewalEvent, UniplayRecreatedLine, UniplayCreditEvent } from "@/lib/uniplayRenewalLogs";

async function loadInBatches<T>(values: { year: number; month: number }[], loader: (value: { year: number; month: number }) => Promise<T>, size = 4): Promise<T[]> {
  const result: T[] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(...await Promise.all(values.slice(i, i + size).map(loader)));
  }
  return result;
}

/** Consulta em memória: não arquiva os logs nem altera clientes ou vencimentos. */
export async function lookupUniplayRenewals(userId: string, start: string, end: string, minimumDate?: string | null) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(start) || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(end) || !Number.isFinite(Date.parse(`${start}T12:00:00Z`)) || !Number.isFinite(Date.parse(`${end}T12:00:00Z`)) || start > end) throw new Error("Selecione um período válido.");
  if (minimumDate && (start < minimumDate || end < minimumDate)) throw new Error("O período não pode ser anterior ao primeiro cliente.");
  const auto = await loadAutomationsConfigRemote(userId);
  if (!isUniplayConnected(auto)) return { source: "folders" as const, events: [] as UniplayRenewalEvent[], recreations: [] as UniplayRecreatedLine[], creditEvents: [] as UniplayCreditEvent[], creditUnitPrice: auto.resellerCreditPriceBrl, months: [] as string[] };
  const months: { year: number; month: number; key: string }[] = [];
  // Uma renovação de agosto pode ter o login recriado em outubro.
  const currentMonth = brazilDay().slice(0, 7);
  const lastMonth = currentMonth;
  let [year, month] = start.slice(0, 7).split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= lastMonth) {
    months.push({ year, month, key: `${year}-${String(month).padStart(2, "0")}` });
    if (++month > 12) { month = 1; year++; }
  }
  const platform = await loadIptvPlatformConfig();
  const base = { apiBaseUrl: platform.apiBaseUrl || auto.iptvApiBaseUrl, apiProxyUrl: platform.apiProxyUrl,
    bearerToken: auto.iptvBearerToken || "", username: auto.iptvUsername, password: auto.iptvPassword,
    regPassword: auto.iptvRegPassword || platform.regPassword, defaultPackage: platform.packageId || "1" };
  if (!base.bearerToken && !(base.username && base.password)) throw new Error("Conecte a Uniplay para consultar os logs deste período.");
  const ensured = await ensureIptvToken(base);
  const creds = { ...base, bearerToken: ensured.token };
  const events: UniplayRenewalEvent[] = [];
  const recreations: UniplayRecreatedLine[] = [];
  const creditEvents: UniplayCreditEvent[] = [];
  const renewalLogs = await loadInBatches(months, ({ year, month }) => listUniplayRenewalLogs(creds, year, month));
  for (const logs of renewalLogs) {
    events.push(...logs.events);
    recreations.push(...logs.recreations);
  }
  const creditMonths = months.filter(({ key }) => key <= end.slice(0, 7));
  const creditLogs = await loadInBatches(creditMonths, ({ year, month }) => listUniplayCreditLogs(creds, year, month));
  for (const logs of creditLogs) creditEvents.push(...logs);
  return { source: "uniplay" as const, events: events.filter((event) => { const day = brazilDay(new Date(event.occurredAt)); return day >= start && day <= end; }), recreations, creditEvents: creditEvents.filter((event) => { const day = brazilDay(new Date(event.occurredAt)); return day >= start && day <= end; }), creditUnitPrice: auto.resellerCreditPriceBrl, months: months.map(({ key }) => key) };
}
