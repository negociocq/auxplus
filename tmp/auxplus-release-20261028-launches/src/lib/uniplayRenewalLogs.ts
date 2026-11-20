export type UniplayRenewalEvent = {
  id: string;
  username: string;
  occurredAt: string;
  oldDue: string;
  newDue: string;
};

export type UniplayRecreatedLine = {
  id: string;
  previousUsername: string;
  newUsername: string;
  occurredAt: string;
};

export type UniplayCreditEvent = {
  id: string;
  username: string;
  occurredAt: string;
  credits: number;
};

/** Somente transferências positivas da própria conta para suas revendas. */
export function parseUniplayCreditLogs(raw: unknown, ownUsername: string): UniplayCreditEvent[] {
  if (!ownUsername.trim()) throw new Error("Configure o usuário da Uniplay para identificar os créditos enviados aos revendedores.");
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { logs?: unknown }).logs) ? (raw as { logs: unknown[] }).logs : [];
  const events = new Map<string, UniplayCreditEvent>();
  for (const value of list) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (String(row.revenda || "").trim().toLowerCase() !== ownUsername.trim().toLowerCase()) continue;
    const action = String(row.acao || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    const quantity = action.match(/^Transfer[êe]ncia de\s+([+-]?[\d.,]+)(?=\s|\.(?:\s|$)|$)/i)?.[1];
    const credits = quantity ? Number(quantity.replace(/\.$/, "").replace(",", ".")) : NaN;
    const username = String(row.usuario || "").trim().match(/^Rev alvo\s*-\s*([A-Za-z0-9._-]+)$/i)?.[1];
    const id = String(row.id || "").trim();
    const occurredAt = panelDate(String(row.date || ""));
    if (!id || !username || !occurredAt || !Number.isFinite(credits) || credits <= 0 || username.toLowerCase() === ownUsername.trim().toLowerCase()) continue;
    events.set(id, { id, username, occurredAt, credits });
  }
  return [...events.values()];
}

/** A coluna usuario é o login antigo; a ação Recreated informa o novo. */
export function parseUniplayRecreatedLines(raw: unknown): UniplayRecreatedLine[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { logs?: unknown }).logs) ? (raw as { logs: unknown[] }).logs : [];
  const links = new Map<string, UniplayRecreatedLine>();
  for (const value of list) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const action = String(row.acao || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
    const edited = /\bEdited\b/i.test(action) ? action.match(/Nome do usu[áa]rio de:\s*([A-Za-z0-9._-]+)\s+para:\s*([A-Za-z0-9._-]+)/i) : null;
    if (!/\bRecreated\b/i.test(action) && !edited) continue;
    const newUsername = edited?.[2] || action.match(/Usu[áa]rio\s+recriado\s+para:\s*([A-Za-z0-9._-]+)/i)?.[1];
    const previousUsername = edited?.[1] || String(row.usuario || "").trim();
    const occurredAt = panelDate(String(row.date || ""));
    const id = String(row.id || "");
    if (!id || !newUsername || !previousUsername || previousUsername === "-" || previousUsername === newUsername || !occurredAt) continue;
    links.set(id, { id, previousUsername, newUsername, occurredAt });
  }
  return [...links.values()];
}

/** Segue somente vínculos explícitos, posteriores à renovação, até o login atual. */
export function resolveRecreatedUsername(username: string, renewedAt: string, links: UniplayRecreatedLine[]) {
  let current = username.trim();
  let after = Date.parse(renewedAt);
  const visited = new Set<string>();
  for (let step = 0; step < links.length; step++) {
    const candidates = links.filter((link) => !visited.has(link.id) && link.previousUsername.toLowerCase() === current.toLowerCase() && Date.parse(link.occurredAt) >= after)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    if (!candidates.length) return { username: current, recreated: visited.size > 0, ambiguous: false };
    const next = candidates[0];
    if (candidates.some((link) => link.occurredAt === next.occurredAt && link.newUsername !== next.newUsername)) return { username: current, recreated: visited.size > 0, ambiguous: true };
    visited.add(next.id);
    current = next.newUsername;
    after = Date.parse(next.occurredAt);
  }
  return { username: current, recreated: visited.size > 0, ambiguous: false };
}

function panelDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second = "00"] = match;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59 || +second > 59) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6] || "00"}-03:00`;
}

/** Créditos consumidos não são o valor em reais pago pelo cliente. */
export function parseUniplayRenewalLogs(raw: unknown): UniplayRenewalEvent[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { logs?: unknown }).logs) ? (raw as { logs: unknown[] }).logs : [];
  const events = new Map<string, UniplayRenewalEvent>();
  for (const value of list) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const action = String(row.acao || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    if (!/\bExtend Line\b/i.test(action)) continue;
    const consumption = action.match(/Consumo de:\s*([\d.,]+)/i);
    if (!consumption || !(Number(consumption[1].replace(",", ".")) > 0)) continue;
    const due = action.match(/Vencimento de:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+para\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
    const oldDue = due && panelDate(due[1]);
    const newDue = due && panelDate(due[2]);
    const occurredAt = panelDate(String(row.date || ""));
    const username = String(row.usuario || "").trim();
    const id = String(row.id || "").trim();
    if (!id || !username || username === "-" || !oldDue || !newDue || !occurredAt || Date.parse(newDue) <= Date.parse(oldDue)) continue;
    events.set(id, { id, username, occurredAt, oldDue, newDue });
  }
  return [...events.values()];
}
