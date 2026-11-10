import { buildLoanReminderMessage, loanReminderKind, readLoan, readLoanAutoSettings, readLoanPixKey, readLoanReminder } from "./loans.ts";

export function loanReminderCandidate(folder: Record<string, unknown>, item: Record<string, unknown>, today: string, time: string) {
  if (folder.type !== "Produto" || String(folder.id) !== String(item.folder_id)) return null;
  const settings = readLoanAutoSettings(String(folder.whatsapp_message || ""));
  if (!settings.enabled || time < settings.sendTime) return null;
  const loan = readLoan({ notes: String(item.notes || "") });
  if (!loan) return null;
  const kind = loanReminderKind(loan, today);
  if (!kind) return null;
  let phone = String(item.phone || "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  if (!/^[1-9]\d{9,14}$/.test(phone)) return null;
  const message = String(folder.whatsapp_message || "");
  return {
    key: `loan_reminder_${folder.user_id}_${item.id}_${loan.dueDate}_${kind}`,
    kind, dueDate: loan.dueDate, phone,
    text: buildLoanReminderMessage(readLoanReminder(message), String(item.name || ""), loan, today, readLoanPixKey(message)),
  };
}
