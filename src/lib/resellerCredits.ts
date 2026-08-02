import type { Item } from "@/types";

const MARKER_RE = /\n?<!--AXRESELL:([\s\S]*?)-->/;

export function stripResellerMarker(notes?: string | null): string {
  return String(notes ?? "")
    .replace(MARKER_RE, "")
    .trim();
}

export function extractResellerCreditsBought(
  notes?: string | null,
): number | null {
  const m = MARKER_RE.exec(String(notes ?? ""));
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as { creditsBought?: unknown };
    const n = Math.floor(Number(parsed.creditsBought));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function embedResellerCreditsBought(
  notes: string | null | undefined,
  creditsBought: number,
): string {
  const clean = stripResellerMarker(notes);
  const n = Math.max(0, Math.floor(Number(creditsBought) || 0));
  const payload = JSON.stringify({ creditsBought: n });
  return clean
    ? `${clean}\n<!--AXRESELL:${payload}-->`
    : `<!--AXRESELL:${payload}-->`;
}

/** Total de créditos já comprados (histórico). Editável. */
export function getResellerCreditsBought(item: Item): number {
  if (
    item.resellerCreditsBought != null &&
    Number.isFinite(Number(item.resellerCreditsBought))
  ) {
    return Math.max(0, Math.floor(Number(item.resellerCreditsBought)));
  }
  const fromNotes = extractResellerCreditsBought(item.notes);
  if (fromNotes != null) return fromNotes;
  // Sem histórico editado: usa o saldo atual como ponto de partida
  return Math.max(0, Math.floor(Number(item.price) || 0));
}

export function withResellerCreditsBought(
  item: Item,
  creditsBought: number,
): Item {
  const n = Math.max(0, Math.floor(Number(creditsBought) || 0));
  return {
    ...item,
    resellerCreditsBought: n,
    notes: embedResellerCreditsBought(item.notes, n),
  };
}

export function resellerCreditsValueBrl(
  creditsBought: number,
  unitPriceBrl: number,
): number {
  const unit = Math.max(0.01, Number(unitPriceBrl) || 8.5);
  const credits = Math.max(0, Math.floor(Number(creditsBought) || 0));
  return Math.round(credits * unit * 100) / 100;
}

export function sumResellerCreditsValueByItems(
  items: Item[],
  unitPriceBrl: number,
): number {
  return items.reduce(
    (s, item) =>
      s + resellerCreditsValueBrl(getResellerCreditsBought(item), unitPriceBrl),
    0,
  );
}

/** Incrementa créditos comprados após recarga paga. */
export function withResellerCreditsBoughtDelta(
  item: Item,
  creditsDelta: number,
): Item {
  const delta = Math.max(0, Math.floor(Number(creditsDelta) || 0));
  return withResellerCreditsBought(item, getResellerCreditsBought(item) + delta);
}
