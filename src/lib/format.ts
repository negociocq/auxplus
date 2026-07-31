import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatMoney(value: number) {
  const [intPart, dec] = value.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R$ ${withSpaces},${dec}`;
}

export function formatBrDate(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(String(value).slice(0, 10)), "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

export function formatBrDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}
