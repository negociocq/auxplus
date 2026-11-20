/** Guarda o recebimento no cliente para o relatório continuar após a limpeza de pedidos. */
export function recordPixPayment(notes: string, payment: { id: string; paidAt: string; amount: number; kind: "renewal" | "initial" }) {
  const marker = /\n?<!--AXPAY:([\s\S]*?)-->/;
  const match = notes.match(marker);
  let history: Record<string, unknown>[] = [];
  if (match) {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) throw new Error("Histórico de pagamentos inválido");
    history = parsed;
  }
  if (history.some((row) => row.paymentId === payment.id)) return notes;
  const date = new Date(payment.paidAt);
  if (!Number.isFinite(date.getTime()) || !(payment.amount > 0)) throw new Error("Pagamento sem data ou valor válido");
  const paidAt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  // Um registro anterior do app já pode representar este mesmo pagamento.
  const matching = history.findIndex((row) => !row.paymentId && row.kind !== "initial" && row.kind !== "estimated" && row.paidAt === paidAt && Math.round(Number(row.amount) * 100) === Math.round(payment.amount * 100));
  const entry = { paidAt, amount: Math.round(payment.amount * 100) / 100, kind: payment.kind, paymentId: payment.id };
  if (matching >= 0) history[matching] = entry;
  else history.push(entry);
  const clean = notes.replace(marker, "").trim();
  return `${clean}${clean ? "\n" : ""}<!--AXPAY:${JSON.stringify(history)}-->`;
}
