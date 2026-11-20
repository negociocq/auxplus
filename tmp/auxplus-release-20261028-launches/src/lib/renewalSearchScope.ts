import { loadAutomationsConfigRemote, isUniplayConnected } from "@/lib/automationsConfig";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import { ensureIptvToken, listIptvUsers, isShortLivedIptvTest } from "@/lib/iptvPanelApi";

export function firstClientDate(clients: { createdAt?: string | null }[]): string | null {
  const dates = clients.map((client) => String(client.createdAt || "").slice(0, 10)).filter((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }).sort();
  return dates[0] || null;
}

export function boundedRenewalRange(range: { start: string; end: string }, firstDate: string | null, today: string) {
  const minimum = firstDate || today;
  const end = range.end < minimum ? minimum : range.end > today ? today : range.end;
  const start = range.start < minimum ? minimum : range.start > end ? end : range.start;
  return { start, end };
}

/** Limite obtido da origem da loja, sem confundir a data do primeiro cliente com vencimento. */
export async function loadRenewalSearchScope(userId: string, firstFolderDate: string | null) {
  const auto = await loadAutomationsConfigRemote(userId);
  if (!isUniplayConnected(auto)) return { source: "folders" as const, firstDate: firstFolderDate };
  const platform = await loadIptvPlatformConfig();
  const base = { apiBaseUrl: platform.apiBaseUrl || auto.iptvApiBaseUrl, apiProxyUrl: platform.apiProxyUrl,
    bearerToken: auto.iptvBearerToken || "", username: auto.iptvUsername, password: auto.iptvPassword,
    regPassword: auto.iptvRegPassword || platform.regPassword, defaultPackage: platform.packageId || "1" };
  const ensured = await ensureIptvToken(base);
  const clients = await listIptvUsers({ ...base, bearerToken: ensured.token }, { fresh: true });
  return { source: "uniplay" as const, firstDate: firstClientDate(clients.filter((client) => !isShortLivedIptvTest(client))) };
}
