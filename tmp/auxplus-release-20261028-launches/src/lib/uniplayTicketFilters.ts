import type { UniplayTicket } from "@/lib/iptvPanelApi";

export const ticketStatuses = [
  { value: "open", label: "Em aberto" },
  { value: "0", label: "Pendentes" },
  { value: "2", label: "Em andamento" },
  { value: "3", label: "Respondidos" },
  { value: "1", label: "Finalizados" },
  { value: "all", label: "Todos" },
];

export function ticketAccountId(token: string): string {
  try {
    const part = token.replace(/^Bearer\s+/i, "").split(".")[1];
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.sub ?? payload.id ?? payload.user_id ?? "");
  } catch { return ""; }
}

export function ticketOwnerId(ticket: UniplayTicket): string {
  return ticket.id_res == null ? "" : String(ticket.id_res);
}

export function ticketStatus(ticket: UniplayTicket): string {
  const raw = String(ticket.status ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    pendente: "0", pending: "0", aberto: "0", open: "0",
    andamento: "2", "em andamento": "2", respondido: "3", answered: "3",
    finalizado: "1", finalizados: "1", fechado: "1", closed: "1",
  };
  return aliases[raw] ?? raw;
}

export function ticketStatusLabel(ticket: UniplayTicket): string {
  return ticketStatuses.find((s) => s.value === ticketStatus(ticket))?.label || String(ticket.status_name || "Status não informado");
}

export function ticketMatchesStatus(ticket: UniplayTicket, status: string): boolean {
  const value = ticketStatus(ticket);
  return status === "all" || (status === "open" ? ["0", "2", "3"].includes(value) : status === value);
}

export function ticketDate(ticket: UniplayTicket): number {
  const raw = String(ticket.created_at ?? ticket.data_formatted ?? ticket.date ?? "");
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  const parsed = Date.parse(br ? `${br[3]}-${br[2]}-${br[1]}${br[4].replace(",", "").trim() ? "T" + br[4].replace(",", "").trim() : "T00:00:00"}` : raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}
