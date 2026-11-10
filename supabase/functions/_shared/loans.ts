type Item = { notes?: string };
type ItemStatus = "Longe de Vencer" | "Perto de Vencer" | "Já Vencido" | "Sem Vencimento";

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

export function loanDueStatus(dueDate: string, today = localLoanDay(), nearDays = 3): ItemStatus {
  const days = dayNumber(dueDate) - dayNumber(today);
  return days < 0 ? "Já Vencido" : days <= nearDays ? "Perto de Vencer" : "Longe de Vencer";
}

// Configuração exclusiva da pasta de empréstimos, preservada na coluna existente.
const pixMarker = /<!--AXLOANPIX:([\s\S]*?)-->/g;
export function readLoanPixKey(message?: string | null): string {
  try {
    const encoded = [...(message || "").matchAll(pixMarker)][0]?.[1];
    return encoded ? decodeURIComponent(encoded) : "";
  } catch { return ""; }
}
export function writeLoanPixKey(message: string | null | undefined, key: string): string {
  const clean = (message || "").replace(pixMarker, "").trim();
  const pix = key.trim();
  if (pix.length > 140) throw Error("A chave PIX deve ter no máximo 140 caracteres.");
  return pix ? `${clean}\n<!--AXLOANPIX:${encodeURIComponent(pix)}-->`.trim() : clean;
}

export const DEFAULT_LOAN_REMINDER = `Olá, {name}! Segue o lembrete do seu empréstimo.

Valor emprestado: {principal}
Valor combinado: {agreed_amount}
Vencimento: {due_date}
Dias em atraso: {late_days}
Juros de atraso: {late_interest}
Total atualizado em {today}: {total}

Se já realizou o pagamento, por favor envie o comprovante.`;
const reminderMarker = /<!--AXLOANREMINDER:([\s\S]*?)-->/g;
export type LoanReminderKind = "before" | "onday";
export function defaultLoanReminder(kind?: LoanReminderKind): string {
  if (!kind) return DEFAULT_LOAN_REMINDER;
  return kind === "before"
    ? `Olá, {name}! Seu empréstimo vence em 2 dias, em {due_date}.\n\nValor para pagamento: {total}\n\nSe já pagou, por favor envie o comprovante.`
    : `Olá, {name}! Hoje é o vencimento do seu empréstimo ({due_date}).\n\nValor para pagamento: {total}\n\nSe já pagou, por favor envie o comprovante.`;
}
function stageMarker(kind: LoanReminderKind) {
  return new RegExp(`<!--AXLOANREMINDER${kind === "before" ? "BEFORE" : "ONDAY"}:([\\s\\S]*?)-->`, "g");
}
export function readLoanReminder(message?: string | null, kind?: LoanReminderKind): string {
  if (kind) {
    try {
      const encoded = [...(message || "").matchAll(stageMarker(kind))][0]?.[1];
      if (encoded) return decodeURIComponent(encoded) || defaultLoanReminder(kind);
    } catch { /* Preserva a mensagem anterior quando uma configuração está inválida. */ }
  }
  try {
    const encoded = [...(message || "").matchAll(reminderMarker)][0]?.[1];
    return encoded ? decodeURIComponent(encoded) || defaultLoanReminder(kind) : defaultLoanReminder(kind);
  } catch { return defaultLoanReminder(kind); }
}
export function writeLoanReminder(message: string | null | undefined, template: string, kind?: LoanReminderKind): string {
  const text = template.trim();
  if (!text || text.length > 4000) throw Error("Escreva uma mensagem de até 4.000 caracteres.");
  const clean = (message || "").replace(kind ? stageMarker(kind) : reminderMarker, "").trim();
  const suffix = kind === "before" ? "BEFORE" : kind === "onday" ? "ONDAY" : "";
  return `${clean}\n<!--AXLOANREMINDER${suffix}:${encodeURIComponent(text)}-->`.trim();
}
export function renderLoanReminder(template: string, values: Record<string, string>, pixKey = ""): string {
  // Substituição única: nomes e chaves PIX que contenham chaves não viram comandos.
  const message = template.replace(/\{([a-z_]+)\}/g, (match, key) => key === "pix" ? pixKey : values[key] ?? match);
  return pixKey && !template.includes("{pix}") ? `${message}\n\nChave PIX para pagamento:\n${pixKey}` : message;
}

export interface LoanAutoSettings { enabled: boolean; sendTime: string }
const autoMarker = /<!--AXLOANAUTO:([\s\S]*?)-->/g;
export function readLoanAutoSettings(message?: string | null): LoanAutoSettings {
  try {
    const encoded = [...(message || "").matchAll(autoMarker)][0]?.[1];
    const value = encoded ? JSON.parse(decodeURIComponent(encoded)) : {};
    return { enabled: value.enabled === true, sendTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(value.sendTime) ? value.sendTime : "09:30" };
  } catch { return { enabled: false, sendTime: "09:30" }; }
}
export function writeLoanAutoSettings(message: string | null | undefined, settings: LoanAutoSettings): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.sendTime)) throw Error("Informe um horário válido.");
  return `${(message || "").replace(autoMarker, "").trim()}\n<!--AXLOANAUTO:${encodeURIComponent(JSON.stringify(settings))}-->`.trim();
}
export function loanReminderKind(loan: LoanTerms, today: string): "before" | "onday" | null {
  if (loan.paidAt) return null;
  const days = dayNumber(loan.dueDate) - dayNumber(today);
  return days === 2 ? "before" : days === 0 ? "onday" : null;
}
export function buildLoanReminderMessage(template: string, name: string, loan: LoanTerms, today: string, pixKey = "") {
  const balance = loanBalance(loan, today);
  const currency = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (value: string) => value.split("-").reverse().join("/");
  return renderLoanReminder(template, { name, principal: currency(loan.principal), agreed_amount: currency(loan.agreedAmount), due_date: date(loan.dueDate), late_days: String(balance.daysLate), late_interest: currency(balance.lateInterest), total: currency(balance.total), today: date(today) }, pixKey);
}
