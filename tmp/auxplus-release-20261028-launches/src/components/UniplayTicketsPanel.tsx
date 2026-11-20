import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniplayTicketList } from "@/components/UniplayTicketList";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createUniplayTicket, ensureIptvToken, findIptvUserByUsername, getLastIssuedIptvToken, getUniplayTicket, listUniplayTickets, replyUniplayTicket, type IptvPanelCreds, type IptvReseller, type UniplayTicket } from "@/lib/iptvPanelApi";

const flows = [
  { label: "VOD · Adição", category: "6", types: ["Filme", "Série"], tech: true },
  { label: "VOD · Atualização", category: "7", types: ["Série", "Novela"], tech: true },
  { label: "VOD · Problemas", category: "5", types: ["Filme", "Série", "Novela"], tech: true },
  { label: "TV ao vivo · Canais", category: "2", types: ["Adição de canal", "Alteração de canal", "Problemas de canal"], tech: true },
  { label: "Outros · Painel", category: "1", types: ["Dúvida sobre o painel"], tech: false },
  { label: "Outros · Reclamação", category: "3", types: ["Reclamação"], tech: false },
  { label: "Outros · Denúncia", category: "4", types: ["Denúncia"], tech: false },
];
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const str = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function UniplayTicketsPanel({ creds, onToken, resellers }: { creds: IptvPanelCreds; onToken: (token: string) => void; resellers: IptvReseller[] }) {
  const latest = useRef({ creds, onToken }); latest.current = { creds, onToken };
  const mounted = useRef(true);
  const [tickets, setTickets] = useState<UniplayTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("1");
  const flow = flows.find((f) => f.category === category)!;
  const [kind, setKind] = useState("Dúvida sobre o painel");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tech, setTech] = useState("1");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [listResetKey, setListResetKey] = useState(0);
  const [selected, setSelected] = useState<UniplayTicket | null>(null);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const requestVersion = useRef(0);
  const pollBusy = useRef(false);
  const liveState = useRef({ selected, saving, replying, opening });
  liveState.current = { selected, saving, replying, opening };
  const pollHandler = useRef<() => Promise<void>>(async () => {});
  const authenticate = async () => {
    const base = latest.current.creds;
    const ensured = await ensureIptvToken(base);
    latest.current.onToken(ensured.token);
    return { ...base, bearerToken: ensured.token };
  };
  const persistToken = () => { const token = getLastIssuedIptvToken(); if (token) latest.current.onToken(token); };
  const refresh = async (silent = false) => {
    const version = ++requestVersion.current;
    if (!silent) setLoading(true);
    try {
      const rows = await listUniplayTickets(await authenticate());
      if (mounted.current && version === requestVersion.current) { setTickets(rows); setError(""); }
      persistToken();
      return mounted.current && version === requestVersion.current;
    } catch (e) { if (mounted.current && !silent) setError(e instanceof Error ? e.message : "Falha ao consultar tickets do UniPlay"); }
    finally { if (mounted.current && !silent) setLoading(false); }
  };
  pollHandler.current = async () => {
    const state = liveState.current;
    if (pollBusy.current || state.saving || state.replying || state.opening || document.visibilityState !== "visible") return;
    pollBusy.current = true;
    try {
      if (!await refresh(true)) return;
      const version = requestVersion.current;
      if (state.selected && mounted.current && !liveState.current.replying) {
        const detail = await getUniplayTicket(await authenticate(), state.selected.id);
        if (mounted.current && version === requestVersion.current) {
          setSelected((current) => current?.id === state.selected?.id ? detail : current);
          persistToken();
        }
      }
    } catch { /* Uma falha temporária mantém a conversa e tenta novamente no próximo ciclo. */ }
    finally { pollBusy.current = false; }
  };
  useEffect(() => {
    mounted.current = true; void refresh();
    const update = () => { void pollHandler.current(); };
    const timer = window.setInterval(update, 10000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false; requestVersion.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    requestVersion.current += 1;
    try {
      const auth = await authenticate();
      const user = username.trim() ? await findIptvUserByUsername(auth, username, { exactOnly: true }) : null;
      if (username.trim() && !user) throw new Error("Usuário IPTV não encontrado. Para um cliente já excluído, deixe este campo vazio e informe o login e o MAC na descrição.");
      await createUniplayTicket(auth, { title, category,
        content: `${kind}\n\n${content.trim()}`, tech: flow.tech ? tech : "",
        idUser: user?.id, username: user?.username,
        channels: category === "2" ? [title.trim()] : [],
      });
      persistToken(); setTitle(""); setContent(""); setUsername("");
      toast.success("Ticket enviado ao suporte UniPlay"); setShowCreate(false); setListResetKey((value) => value + 1); await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar ticket"); }
    finally { setSaving(false); }
  };
  const open = async (ticket: UniplayTicket) => {
    requestVersion.current += 1;
    setOpening(true); setSelected(null); setMessage("");
    try { setSelected(await getUniplayTicket(await authenticate(), ticket.id)); persistToken(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao abrir ticket"); }
    finally { setOpening(false); }
  };
  const reply = async () => {
    if (!selected || replying) return;
    setReplying(true);
    requestVersion.current += 1;
    try {
      const auth = await authenticate(); await replyUniplayTicket(auth, selected.id, message);
      setMessage(""); toast.success("Mensagem enviada ao UniPlay");
      setSelected(await getUniplayTicket(auth, selected.id)); persistToken();
      await refresh(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem"); }
    finally { setReplying(false); }
  };
  const chat = Array.isArray(selected?.chat) ? selected.chat as Record<string, unknown>[] : [];
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Atualização automática a cada 10 segundos.</p><Button type="button" variant={showCreate ? "outline" : "default"} disabled={saving} onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Fechar formulário" : "Novo ticket"}</Button></div>
    {showCreate ? <form className="ax-surface space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div><h2 className="font-semibold">Criar ticket no UniPlay</h2><p className="text-xs text-muted-foreground">Solicitações e atendimento do suporte do seu painel UniPlay.</p></div>
      <fieldset disabled={saving} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="ticket-category">Tipo de atendimento</Label><select id="ticket-category" className={selectClass} value={category} onChange={(e) => { setCategory(e.target.value); setKind(flows.find((f) => f.category === e.target.value)!.types[0]); }}>{flows.map((f) => <option key={f.category} value={f.category}>{f.label}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="ticket-kind">Solicitação</Label><select id="ticket-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>{flow.types.map((type) => <option key={type}>{type}</option>)}</select></div>
          {flow.tech ? <div className="space-y-1"><Label htmlFor="ticket-tech">Tecnologia</Label><select id="ticket-tech" className={selectClass} value={tech} onChange={(e) => setTech(e.target.value)}><option value="0">Todas</option><option value="1">IPTV</option><option value="2">P2P</option></select></div> : null}
          <div className="space-y-1"><Label htmlFor="ticket-user">Usuário IPTV (opcional)</Label><Input id="ticket-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Login do cliente no painel" /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="ticket-title">Título</Label><Input id="ticket-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Resumo da solicitação" /></div>
        <div className="space-y-1"><Label htmlFor="ticket-content">Descrição</Label><Textarea id="ticket-content" required rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Descreva o problema. Para conteúdos, informe nome, ano, temporada e episódio. Para aparelhos, informe o MAC e o app." /></div>
      </fieldset>
      <Button type="submit" disabled={saving || !title.trim() || !content.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar ticket</Button>
    </form> : null}
    <UniplayTicketList resetKey={listResetKey} resellers={resellers} tickets={tickets} token={creds.bearerToken} loading={loading} error={error} opening={opening} onRefresh={() => void refresh()} onOpen={(ticket) => void open(ticket)} />
    <Dialog open={selected !== null} onOpenChange={(value) => { if (!value && !replying) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Ticket #{selected?.id} · {str(selected?.title ?? selected?.titulo)}</DialogTitle></DialogHeader><p className="whitespace-pre-wrap break-words text-sm">{str(selected?.content)}</p><div className="max-h-72 space-y-2 overflow-y-auto">{chat.map((row, index) => <div key={str(row.id) || index} className="rounded-md border p-3"><p className="whitespace-pre-wrap break-words text-sm">{str(row.mensagem ?? row.content ?? row.message)}</p><p className="mt-1 text-xs text-muted-foreground">{str(row.data_formatted ?? row.created_at)}</p></div>)}</div><form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void reply(); }}><Label htmlFor="ticket-reply">Mensagem</Label><Textarea id="ticket-reply" value={message} onChange={(e) => setMessage(e.target.value)} disabled={replying || selected?.blocked === true || selected?.blocked === 1} /><Button type="submit" disabled={replying || !message.trim() || selected?.blocked === true || selected?.blocked === 1}>{replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar mensagem</Button></form></DialogContent></Dialog>
  </div>;
}
