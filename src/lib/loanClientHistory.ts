import type { Item } from "@/types";
import { loanBalance, readLoan, type LoanReceipt } from "@/lib/loans";

export function loanClientPhone(raw?: string): string | null {
  let phone = String(raw || "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  if (phone.startsWith("55") && phone.length === 12) phone = `${phone.slice(0, 4)}9${phone.slice(4)}`;
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : null;
}
export function buildLoanClientHistory(selected: Item, items: Item[], allowedFolderIds: string[], today: string) {
  const phone = loanClientPhone(selected.phone);
  const allowed = new Set(allowedFolderIds);
  const matches = items.filter(item => allowed.has(item.folderId) && (phone ? loanClientPhone(item.phone) === phone : item.id === selected.id));
  const entries = matches.flatMap(item => {
    const loan = readLoan(item);
    if (!loan) return [];
    const receipts: LoanReceipt[] = [...(loan.receipts || [])];
    if (loan.paidAt && !receipts.some(r => r.kind === "full") && Number.isFinite(loan.paidAmount) && loan.paidAmount! > 0) {
      const principal = Math.min(loan.principal, loan.paidAmount!);
      receipts.push({ id: `legacy-full-${item.id}`, kind: "full", paidAt: loan.paidAt, amount: loan.paidAmount!, principalPaid: principal, interestPaid: Math.round((loan.paidAmount! - principal) * 100) / 100, previousDueDate: loan.dueDate });
    }
    return [{ item, loan, receipts, balance: loanBalance(loan, today), registeredAt: loan.registeredAt || null, initialDueDate: loan.initialDueDate || receipts.find(r => r.nextDueDate)?.previousDueDate || null }];
  }).sort((a, b) => b.loan.lentAt.localeCompare(a.loan.lentAt) || a.item.id.localeCompare(b.item.id));
  const sum = (values: number[]) => values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
  const receipts = entries.flatMap(entry => entry.receipts);
  return {
    phone, entries, unconfigured: matches.length - entries.length,
    loanCount: entries.length, openCount: entries.filter(e => !e.loan.paidAt).length,
    paidCount: entries.filter(e => e.loan.paidAt).length,
    totalLent: sum(entries.map(e => e.loan.principal)),
    totalReceived: sum(receipts.map(r => r.amount)),
    principalReceived: sum(receipts.map(r => r.principalPaid)),
    interestReceived: sum(receipts.map(r => r.interestPaid)),
    principalOutstanding: sum(entries.filter(e => !e.loan.paidAt).map(e => e.balance.principalRemaining)),
    outstanding: sum(entries.map(e => e.balance.outstanding)),
    paymentCount: receipts.length,
    firstLoanAt: entries.map(e => e.loan.lentAt).sort()[0] || null,
  };
}
