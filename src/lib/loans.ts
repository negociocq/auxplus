import type { Item } from "@/types";

export interface LoanTerms {
  version: 1;
  principal: number;
  agreedAmount: number;
  lentAt: string;
  dueDate: string;
  lateRate: number;
  latePeriod: "day" | "month";
  paidAt?: string;
  paidAmount?: number;
}

const marker = /<!--AXLOAN:([\s\S]*?)-->/g;
export const stripLoan = (notes = "") => notes.replace(marker, "").trim();
export function readLoan(item: Pick<Item, "notes">): LoanTerms | null {
  try {
    const match = [...(item.notes || "").matchAll(marker)][0];
    if (!match) return null;
    const loan = JSON.parse(match[1]) as LoanTerms;
    validateLoan(loan);
    return loan;
  } catch { return null; }
}
function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Informe uma data válida.");
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw Error("Informe uma data válida.");
  return ms / 86400000;
}
export function localLoanDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function validateLoan(loan: LoanTerms) {
  if (loan.version !== 1 || ![loan.principal, loan.agreedAmount, loan.lateRate].every(Number.isFinite)
    || loan.principal <= 0 || loan.agreedAmount < loan.principal || loan.lateRate < 0
    || !["day", "month"].includes(loan.latePeriod)) throw Error("Confira os valores e a taxa de juros do empréstimo.");
  if (dayNumber(loan.dueDate) < dayNumber(loan.lentAt)) throw Error("O vencimento deve ser igual ou posterior à data do empréstimo.");
  if (loan.paidAt && (!Number.isFinite(Date.parse(loan.paidAt)) || !Number.isFinite(loan.paidAmount) || loan.paidAmount! < 0)) throw Error("Pagamento inválido.");
}
export function writeLoan(notes: string | undefined, loan: LoanTerms): string {
  validateLoan(loan);
  return `${stripLoan(notes)}\n<!--AXLOAN:${JSON.stringify(loan)}-->`.trim();
}
/** Juros simples sobre o valor combinado, a partir do dia seguinte ao vencimento.
 * Taxa mensal proporcional por dia, com mês comercial de 30 dias. Sem capitalização. */
export function loanBalance(loan: LoanTerms, today = localLoanDay()) {
  validateLoan(loan);
  const end = loan.paidAt ? localLoanDay(new Date(loan.paidAt)) : today;
  const daysLate = Math.max(0, dayNumber(end) - dayNumber(loan.dueDate));
  const agreedCents = Math.round(loan.agreedAmount * 100);
  const lateCents = Math.round(agreedCents * loan.lateRate / 100 * daysLate / (loan.latePeriod === "month" ? 30 : 1));
  const total = loan.paidAt ? loan.paidAmount! : (agreedCents + lateCents) / 100;
  return { daysLate, lateInterest: lateCents / 100, agreedInterest: Math.round((loan.agreedAmount - loan.principal) * 100) / 100, total, outstanding: loan.paidAt ? 0 : total };
}
