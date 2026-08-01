import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatMoney(value: number) {
  const [intPart, dec] = value.toFixed(2).split(".");
  // Espaço não separável: evita "R$ 3" / "894,99" em linhas diferentes
  const nbsp = "\u00A0";
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, nbsp);
  return `R$${nbsp}${withSpaces},${dec}`;
}

/** Exibe `23/07/2027` ou `23/07/2027 23:00:56` quando houver horário. */
export function formatBrDate(value?: string | null) {
  if (!value) return "—";
  const s = String(value).trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const base = `${m[3]}/${m[2]}/${m[1]}`;
    if (m[4] != null) {
      return `${base} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
    }
    return base;
  }
  try {
    return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

/** Valor para `<input type="datetime-local">`. */
export function toDatetimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const m = String(value)
    .trim()
    .match(
      /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
  if (!m) return "";
  if (!m[2]) return `${m[1]}T00:00`;
  return `${m[1]}T${m[2]}:${m[3]}${m[4] != null ? `:${m[4]}` : ""}`;
}

/** Converte valor de datetime-local → `yyyy-MM-dd HH:mm:ss`. */
export function fromDatetimeLocalValue(value: string): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
    return null;
  }
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? "00"}`;
}

export function formatBrDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}
