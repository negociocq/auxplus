export function dueTime(value: unknown): string | null {
  const match = String(value || "").match(/(?:^|[T\s])(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || +match[1] > 23 || +match[2] > 59 || +(match[3] || 0) > 59) return null;
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

/** Mantém data sem horário como desconhecida; nunca inventa meia-noite. */
export function mergeItemDue(date: unknown, time?: unknown): string | null {
  const raw = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const clock = dueTime(raw) || dueTime(time);
  return clock ? `${raw.slice(0, 10)} ${clock}` : raw.slice(0, 10);
}

export function normalizePanelDue(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{10}(?:\d{3})?$/.test(raw) || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const date = /^\d+$/.test(raw) ? new Date(Number(raw) * (raw.length === 10 ? 1000 : 1)) : new Date(raw);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const part = (key: string) => parts.find((entry) => entry.type === key)?.value;
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
  }
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  return mergeItemDue(br ? `${br[3]}-${br[2]}-${br[1]}${br[4]}` : raw);
}
