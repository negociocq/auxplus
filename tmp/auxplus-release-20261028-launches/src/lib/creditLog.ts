/**
 * Log central de créditos UniPlay: registra toda ação que altera o saldo
 * (renovação, ativação de teste, recarga de revendedor) com saldo antigo → novo.
 * Persiste por usuário em localStorage e alimenta também as notificações.
 */
import {
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import {
  ensureIptvToken,
  fetchIptvPanelCredits,
} from "@/lib/iptvPanelApi";

export type CreditLogType = "recarga" | "renovacao" | "teste" | "outro";

export type CreditLogEntry = {
  id: string;
  at: number;
  type: CreditLogType;
  label: string;
  detail?: string;
  /** Créditos líquidos da ação (negativo = gasto). */
  delta?: number;
  oldBalance?: number | null;
  newBalance?: number | null;
};

const STORAGE_KEY = "auxplus-credit-log";
const BAL_KEY = "auxplus-credit-balance";
const MAX_ENTRIES = 200;

type Listener = () => void;
const listeners = new Set<Listener>();
export const CREDIT_LOG_CHANGED_EVENT = "auxplus:credit-log-changed";

const boxKey = (userId: string, key: string) => `${key}:${userId}`;

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CREDIT_LOG_CHANGED_EVENT));
  }
}

/** Último saldo UniPlay conhecido (para compor o "saldo antigo"). */
export function getLastCreditBalance(userId: string): number | null {
  if (!userId) return null;
  const v = readJSON<number>(boxKey(userId, BAL_KEY));
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function setLastCreditBalance(userId: string, value: number) {
  if (!userId || !Number.isFinite(Number(value))) return;
  writeJSON(boxKey(userId, BAL_KEY), Number(value));
}

export function getCreditLog(userId: string): CreditLogEntry[] {
  if (!userId) return [];
  return readJSON<CreditLogEntry[]>(boxKey(userId, STORAGE_KEY)) || [];
}

export function subscribeCreditLog(cb: Listener): () => void {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CREDIT_LOG_CHANGED_EVENT, onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CREDIT_LOG_CHANGED_EVENT, onStorage);
  };
}

export function pushCreditLog(userId: string, entry: CreditLogEntry) {
  if (!userId) return;
  const list = [entry, ...getCreditLog(userId)].slice(0, MAX_ENTRIES);
  writeJSON(boxKey(userId, STORAGE_KEY), list);
  emit();
}

export function patchCreditLogEntry(
  userId: string,
  id: string,
  patch: Partial<CreditLogEntry>,
) {
  if (!userId) return;
  const list = getCreditLog(userId).map((e) =>
    e.id === id ? { ...e, ...patch } : e,
  );
  writeJSON(boxKey(userId, STORAGE_KEY), list);
  emit();
}

/** Mapeia o `source` dos eventos de crédito para o tipo do log. */
export function creditLogTypeForSource(source?: string): CreditLogType {
  const s = String(source || "");
  if (/reseller|recarga/i.test(s)) return "recarga";
  if (/creat.?test|test_activate/i.test(s)) return "teste";
  if (/renew|renov/i.test(s)) return "renovacao";
  return "outro";
}

export function creditLogLabelForSource(source?: string): string {
  const map: Record<string, string> = {
    reseller_manual: "Recarga de revendedor",
    pix_reseller_credits: "Recarga de revendedor (PIX)",
    renew_manual: "Renovação",
    pix_renew: "Renovação (PIX)",
    create_test: "Teste criado",
    test_activate: "Teste ativado (plano)",
    pix_test_activate: "Teste ativado (PIX)",
  };
  return map[String(source || "")] || "Alteração de crédito";
}

/** Busca o saldo real no painel UniPlay de um usuário. */
export async function fetchPanelCreditsForUser(
  userId: string,
): Promise<number | null> {
  try {
    const cfg = await loadAutomationsConfigRemote(userId).catch(() =>
      loadAutomationsConfig(userId),
    );
    const plat = await loadIptvPlatformConfig();
    const ensured = await ensureIptvToken({
      apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
      bearerToken: cfg.iptvBearerToken?.trim() || "",
      username: cfg.iptvUsername?.trim() || undefined,
      password: cfg.iptvPassword || undefined,
      defaultPackage: plat.packageId || "1",
      regPassword: plat.regPassword || undefined,
      apiProxyUrl: plat.apiProxyUrl || undefined,
    });
    const creds = {
      apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
      bearerToken: ensured.token,
      username: cfg.iptvUsername?.trim() || undefined,
      password: cfg.iptvPassword || undefined,
      defaultPackage: plat.packageId.trim() || "1",
      regPassword: plat.regPassword?.trim() || undefined,
      apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
    };
    const bal = await fetchIptvPanelCredits(creds);
    return typeof bal.credits === "number" && Number.isFinite(bal.credits)
      ? bal.credits
      : null;
  } catch {
    return null;
  }
}

/** Formata saldo (ou "?" quando desconhecido). */
export function fmtCreditValue(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "?";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1 });
}