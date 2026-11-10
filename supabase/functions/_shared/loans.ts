type Item = { notes?: string };
type ItemStatus = "Longe de Vencer" | "Perto de Vencer" | "Já Vencido" | "Sem Vencimento";

export interface LoanTerms {
  version: 1;
  principal: number;
  agreedAmount: number;
  lentAt: string;
  dueDate: string;
  lateRate: number;
  lateRateType?: "percent" | "amount";
  latePeriod: "day" | "month";
  paidAt?: string;
  paidAmount?: number;
  cycleDay?: number;
  receipts?: LoanReceipt[];
  registeredAt?: string;
  initialDueDate?: string;
  balanceState?: { asOf: string; principal: number; agreedAmount: number; lateInterest: number };
}
export interface LoanReceipt {
  id: string;
  kind: "interest" | "full" | "partial";
  paidAt: string;
  amount: number;
  principalPaid: number;
  interestPaid: number;
  previousDueDate: string;
  nextDueDate?: string;
}

/** Equivalent daily rate for legacy monthly contracts, without changing their balance. */
export const dailyLoanRate = (loan: Pick<LoanTerms, "lateRate" | "latePeriod">) => loan.lateRate / (loan.latePeriod === "month" ? 30 : 1);

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
    || (loan.lateRateType != null && !["percent", "amount"].includes(loan.lateRateType))
    || !["day", "month"].includes(loan.latePeriod)) throw Error("Confira os valores e a taxa de juros do empréstimo.");
  if (dayNumber(loan.dueDate) < dayNumber(loan.lentAt)) throw Error("O vencimento deve ser igual ou posterior à data do empréstimo.");
  if (loan.paidAt && (!Number.isFinite(Date.parse(loan.paidAt)) || !Number.isFinite(loan.paidAmount) || loan.paidAmount! < 0)) throw Error("Pagamento inválido.");
  if (loan.cycleDay != null && (!Number.isInteger(loan.cycleDay) || loan.cycleDay < 1 || loan.cycleDay > 31)) throw Error("Dia do vencimento inválido.");
  if (loan.registeredAt && !Number.isFinite(Date.parse(loan.registeredAt))) throw Error("Data de cadastro inválida.");
  if (loan.initialDueDate) dayNumber(loan.initialDueDate);
  if (loan.balanceState) {
    const state = loan.balanceState;
    dayNumber(state.asOf);
    if (![state.principal, state.agreedAmount, state.lateInterest].every(Number.isFinite) || state.principal < 0 || state.principal > loan.principal || state.agreedAmount < state.principal || state.lateInterest < 0) throw Error("Saldo do empréstimo inválido.");
  }
  if (loan.receipts != null) {
    if (!Array.isArray(loan.receipts)) throw Error("Histórico de pagamentos inválido.");
    const ids = new Set<string>();
    for (const receipt of loan.receipts) {
      if (!receipt.id || ids.has(receipt.id) || !["interest", "full", "partial"].includes(receipt.kind) || !Number.isFinite(Date.parse(receipt.paidAt)) || ![receipt.amount, receipt.principalPaid, receipt.interestPaid].every(Number.isFinite) || receipt.amount <= 0 || receipt.principalPaid < 0 || receipt.interestPaid < 0 || Math.round(receipt.amount * 100) !== Math.round((receipt.principalPaid + receipt.interestPaid) * 100)) throw Error("Histórico de pagamentos inválido.");
      ids.add(receipt.id); dayNumber(receipt.previousDueDate);
      if (receipt.nextDueDate) dayNumber(receipt.nextDueDate);
    }
  }
}
export function writeLoan(notes: string | undefined, loan: LoanTerms): string {
  validateLoan(loan);
  return `${stripLoan(notes)}\n<!--AXLOAN:${JSON.stringify(loan)}-->`.trim();
}
/** Juros simples em reais ou porcentagem do valor combinado, desde o dia seguinte ao vencimento.
 * Taxa mensal proporcional por dia, com mês comercial de 30 dias. Sem capitalização. */
export function loanBalance(loan: LoanTerms, today = localLoanDay()) {
  validateLoan(loan);
  const end = loan.paidAt ? localLoanDay(new Date(loan.paidAt)) : today;
  const daysLate = Math.max(0, dayNumber(end) - dayNumber(loan.dueDate));
  const agreedCents = Math.round((loan.balanceState?.agreedAmount ?? loan.agreedAmount) * 100);
  const principalRemaining = loan.balanceState?.principal ?? loan.principal;
  const accrualDays = Math.max(0, dayNumber(end) - Math.max(dayNumber(loan.dueDate), dayNumber(loan.balanceState?.asOf || loan.dueDate)));
  const periodCents = loan.lateRateType === "amount" ? loan.lateRate * 100 : agreedCents * loan.lateRate / 100;
  const lateCents = Math.round((loan.balanceState?.lateInterest || 0) * 100 + periodCents * accrualDays / (loan.latePeriod === "month" ? 30 : 1));
  const total = loan.paidAt ? loan.paidAmount! : (agreedCents + lateCents) / 100;
  return { daysLate, lateInterest: lateCents / 100, agreedInterest: Math.round(agreedCents - principalRemaining * 100) / 100, principalRemaining: loan.paidAt ? 0 : principalRemaining, total, outstanding: loan.paidAt ? 0 : total };
}

export function nextLoanMonth(dueDate: string, cycleDay = Number(dueDate.slice(8, 10))): string {
  dayNumber(dueDate);
  const month = new Date(`${dueDate.slice(0, 7)}-01T12:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  month.setUTCDate(Math.min(cycleDay, lastDay));
  return month.toISOString().slice(0, 10);
}
export function recordLoanPayment(loan: LoanTerms, payment: { id: string; kind: "interest" | "full" | "partial"; paidAt: string; nextDueDate?: string; amount?: number }): LoanTerms {
  validateLoan(loan);
  if (loan.receipts?.some(r => r.id === payment.id)) return loan;
  if (loan.paidAt) throw Error("Este empréstimo já foi quitado.");
  if (!payment.id || !Number.isFinite(Date.parse(payment.paidAt))) throw Error("Pagamento inválido.");
  const today = localLoanDay(new Date(payment.paidAt));
  if (loan.balanceState && today < loan.balanceState.asOf) throw Error("O pagamento deve ser posterior ao último pagamento registrado.");
  const balance = loanBalance(loan, today);
  const principal = balance.principalRemaining;
  const interest = Math.round((balance.total - principal) * 100) / 100;
  if (payment.kind === "partial") {
    const cents = Math.round((payment.amount ?? NaN) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || cents > Math.round(balance.total * 100)) throw Error("Informe um valor maior que zero e até o saldo atual.");
    const latePaid = Math.min(cents, Math.round(balance.lateInterest * 100));
    const agreedInterestPaid = Math.min(cents - latePaid, Math.round(balance.agreedInterest * 100));
    const principalPaid = cents - latePaid - agreedInterestPaid;
    const fullyPaid = cents === Math.round(balance.total * 100);
    const receipt: LoanReceipt = { id: payment.id, kind: fullyPaid ? "full" : "partial", paidAt: payment.paidAt, amount: cents / 100, principalPaid: principalPaid / 100, interestPaid: (latePaid + agreedInterestPaid) / 100, previousDueDate: loan.dueDate };
    const next: LoanTerms = { ...loan, receipts: [...(loan.receipts || []), receipt], balanceState: { asOf: today, principal: Math.max(0, Math.round(principal * 100) - principalPaid) / 100, agreedAmount: Math.max(0, Math.round((principal + balance.agreedInterest) * 100) - agreedInterestPaid - principalPaid) / 100, lateInterest: Math.max(0, Math.round(balance.lateInterest * 100) - latePaid) / 100 }, ...(fullyPaid ? { paidAt: payment.paidAt, paidAmount: balance.total } : {}) };
    validateLoan(next);
    return next;
  }
  if (payment.kind === "interest" && interest <= 0) throw Error("Este empréstimo não tem juros pendentes. Use a quitação total.");
  if (payment.kind === "interest" && (!payment.nextDueDate || dayNumber(payment.nextDueDate) <= Math.max(dayNumber(loan.dueDate), dayNumber(today)))) throw Error("Escolha um novo vencimento posterior ao atual e à data do pagamento.");
  const receipt: LoanReceipt = { id: payment.id, kind: payment.kind, paidAt: payment.paidAt, amount: payment.kind === "interest" ? interest : balance.total, principalPaid: payment.kind === "interest" ? 0 : principal, interestPaid: interest, previousDueDate: loan.dueDate, ...(payment.kind === "interest" ? { nextDueDate: payment.nextDueDate } : {}) };
  const receipts = [...(loan.receipts || []), receipt];
  const next: LoanTerms = payment.kind === "full"
    ? { ...loan, paidAt: payment.paidAt, paidAmount: balance.total, receipts }
    : { ...loan, dueDate: payment.nextDueDate!, ...(loan.balanceState ? { balanceState: { asOf: today, principal, agreedAmount: Math.round((principal + loan.agreedAmount - loan.principal) * 100) / 100, lateInterest: 0 } } : {}), cycleDay: payment.nextDueDate === nextLoanMonth(loan.dueDate, loan.cycleDay) ? loan.cycleDay || Number(loan.dueDate.slice(8, 10)) : Number(payment.nextDueDate!.slice(8, 10)), receipts };
  validateLoan(next);
  return next;
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

export interface LoanAutoSettings { enabled: boolean; sendTime: string; sendBefore: boolean; sendOnDay: boolean }
const autoMarker = /<!--AXLOANAUTO:([\s\S]*?)-->/g;
export function readLoanAutoSettings(message?: string | null): LoanAutoSettings {
  try {
    const encoded = [...(message || "").matchAll(autoMarker)][0]?.[1];
    const value = encoded ? JSON.parse(decodeURIComponent(encoded)) : {};
    const sendBefore = typeof value.sendBefore === "boolean" ? value.sendBefore : value.enabled === true;
    const sendOnDay = typeof value.sendOnDay === "boolean" ? value.sendOnDay : value.enabled === true;
    return { enabled: sendBefore || sendOnDay, sendBefore, sendOnDay, sendTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(value.sendTime) ? value.sendTime : "09:30" };
  } catch { return { enabled: false, sendBefore: false, sendOnDay: false, sendTime: "09:30" }; }
}
export function writeLoanAutoSettings(message: string | null | undefined, settings: Pick<LoanAutoSettings, "enabled" | "sendTime"> & Partial<Pick<LoanAutoSettings, "sendBefore" | "sendOnDay">>): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.sendTime)) throw Error("Informe um horário válido.");
  const sendBefore = settings.sendBefore ?? settings.enabled;
  const sendOnDay = settings.sendOnDay ?? settings.enabled;
  const normalized = { enabled: sendBefore || sendOnDay, sendBefore, sendOnDay, sendTime: settings.sendTime };
  return `${(message || "").replace(autoMarker, "").trim()}\n<!--AXLOANAUTO:${encodeURIComponent(JSON.stringify(normalized))}-->`.trim();
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
