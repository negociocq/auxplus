import { useEffect, useState } from "react";
import { Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ticketAccountId, ticketDate, ticketMatchesStatus, ticketOwnerId, ticketStatus, ticketStatusLabel, ticketStatuses } from "@/lib/uniplayTicketFilters";
import type { UniplayTicket, IptvReseller } from "@/lib/iptvPanelApi";

export function UniplayTicketList({ tickets, resellers, token, loading, error, opening, onRefresh, onOpen, resetKey }: {
  resetKey: number;
  resellers: IptvReseller[];
  tickets: UniplayTicket[]; token: string; loading: boolean; error: string; opening: boolean;
  onRefresh: () => void; onOpen: (ticket: UniplayTicket) => void;
}) {
  const accountId = ticketAccountId(token);
  const resellerLabel = (id: string) => {
    const reseller = resellers.find((row) => String(row.id) === id);
    if (!reseller) return `Revendedor #${id}`;
    const name = reseller.name?.trim() || reseller.nota?.trim();
    return name && name !== reseller.username ? `${name} (${reseller.username})` : reseller.username || `Revendedor #${id}`;
  };
  const [scope, setScope] = useState("mine");
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    setScope("mine"); setStatus("open"); setOwner(""); setQuery(""); setPage(1);
  }, [resetKey]);
  const effectiveScope = accountId ? scope : "all";
  const scoped = tickets.filter((ticket) => {
    const id = ticketOwnerId(ticket);
    return effectiveScope === "all" || (effectiveScope === "mine" ? id === accountId : id !== "" && id !== accountId);
  });
  const owners = [...new Set(tickets.map(ticketOwnerId).filter((id) => id && id !== accountId))].sort();
  const filtered = scoped.filter((ticket) => ticketMatchesStatus(ticket, status) &&
    (!owner || ticketOwnerId(ticket) === owner) &&
    [ticket.id, ticket.title, ticket.titulo, ticketOwnerId(ticket), resellerLabel(ticketOwnerId(ticket)), ticketStatusLabel(ticket)]
      .join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => ticketDate(b) - ticketDate(a) || Number(b.id) - Number(a.id));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { setPage(1); }, [scope, status, query, owner]);
  return <section className="ax-surface space-y-4 p-4">
    <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Tickets do UniPlay</h2><p className="text-xs text-muted-foreground">Mais recentes primeiro · 10 por página</p></div><Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</Button></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Origem dos tickets">{[
      { value: "mine", label: "Meus tickets", count: tickets.filter((t) => ticketOwnerId(t) === accountId && accountId).length },
      { value: "resellers", label: "Revendedores", count: tickets.filter((t) => ticketOwnerId(t) && ticketOwnerId(t) !== accountId).length },
      { value: "all", label: "Todos", count: tickets.length },
    ].map((option) => <Button key={option.value} type="button" size="sm" variant={effectiveScope === option.value ? "default" : "outline"} disabled={!accountId && option.value !== "all"} aria-pressed={effectiveScope === option.value} onClick={() => { setScope(option.value); setOwner(""); }}>{option.label}<Badge variant="secondary">{option.count}</Badge></Button>)}</div>
    {!accountId ? <p className="text-xs text-muted-foreground">Não foi possível identificar sua conta pelo token. Use o filtro de solicitante para separar os tickets.</p> : null}
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status dos tickets">{ticketStatuses.map((option) => <Button key={option.value} type="button" size="sm" variant={status === option.value ? "secondary" : "ghost"} aria-pressed={status === option.value} onClick={() => setStatus(option.value)}>{option.label}<span className="text-xs opacity-70">{scoped.filter((t) => ticketMatchesStatus(t, option.value)).length}</span></Button>)}</div>
    <div className="flex flex-col gap-2 sm:flex-row"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar título, número ou solicitante" aria-label="Buscar tickets" />{effectiveScope !== "mine" ? <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Solicitante"><option value="">Todos os solicitantes</option>{effectiveScope === "all" && accountId ? <option value={accountId}>Minha conta</option> : null}{owners.map((id) => <option key={id} value={id}>{resellerLabel(id)}</option>)}</select> : null}</div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : loading && tickets.length === 0 ? <p className="text-sm text-muted-foreground">Carregando tickets…</p> : filtered.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum ticket nestes filtros.</p> : null}
    <ul className="space-y-2">{filtered.slice((currentPage - 1) * 10, currentPage * 10).map((ticket) => {
      const id = ticketOwnerId(ticket);
      const author = id === accountId && accountId ? "Minha conta" : id ? `Revendedor #${id}` : "Solicitante não informado";
      return <li key={ticket.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${ticketStatus(ticket) === "1" ? "bg-muted/30" : ""}`}><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">#{ticket.id} · {String(ticket.title ?? ticket.titulo ?? "Ticket")}</p><p className="mt-1 text-xs text-muted-foreground">{author} · {String(ticket.data_formatted ?? ticket.created_at ?? ticket.date ?? "")}</p></div><div className="flex items-center gap-2"><Badge variant={ticketStatus(ticket) === "1" ? "outline" : "secondary"}>{ticketStatusLabel(ticket)}</Badge><Button type="button" size="sm" variant="outline" disabled={opening} onClick={() => onOpen(ticket)}><MessageSquare className="h-4 w-4" />Abrir</Button></div></li>;
    })}</ul>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">{filtered.length} ticket(s) · Página {currentPage} de {totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div></div>
  </section>;
}
