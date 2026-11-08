import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { recoveryRequest } from "@/lib/whatsappRecovery";
import { brasiliaDay } from "@/lib/uniplayDiscover";
import { statusQueueSummary, type StatusPost } from "@/lib/statusQueue";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = { settings: { enabled: boolean; send_time: string; pages_per_kind?: number; manual_request_day?: string; last_error?: string; cooldown_until?: string }; posts: StatusPost[] };
const labels: Record<string, string> = { queued: "Na fila", sending: "Publicando", sent: "Confirmado pelo WhatsApp", provider_recorded: "Registrado · aguardando confirmação", uncertain: "Sem confirmação · confira no WhatsApp", failed: "Falhou" };
export function StatusAutomation({ category, onChange }: { category: "games" | "catalog"; onChange?: () => void }) {
  const { user } = useApp();
  const [state, setState] = useState<State>();
  const [time, setTime] = useState("09:00"), [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0), mutating = useRef(false), reading = useRef(false);
  const service = category === "games" ? "wa-football-status" : "wa-content-status";
  const prefix = category === "games" ? "football" : "content";
  const today = brasiliaDay(), summary = statusQueueSummary(state?.posts || [], today);
  const preparing = state?.settings.manual_request_day === today && summary.total === 0 && !state?.settings.last_error;
  const load = async (initial = false) => {
    if (!user?.id || mutating.current || reading.current) return;
    reading.current = true;
    const version = generation.current;
    try {
      const next = await recoveryRequest(user.id, `${prefix}-status-state`, {}, service) as State;
      if (version !== generation.current) return;
      setState(next); setError("");
      if (initial) { setTime(next.settings.send_time); setPages(next.settings.pages_per_kind || 1); }
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : "Falha ao consultar a fila."); }
    finally { reading.current = false; }
  };
  useEffect(() => {
    generation.current++; setState(undefined); setError(""); setNotice("");
    void load(true);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => { generation.current++; window.clearInterval(timer); };
    // Each request is scoped to the authenticated account and selected queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, category]);
  const mutate = async (action: "save" | "post-now", enabled = state?.settings.enabled === true) => {
    if (!user?.id || busy) return;
    if (action === "save" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { toast.error("Informe um horário válido."); return; }
    setBusy(true); mutating.current = true; const version = ++generation.current; setError(""); setNotice("");
    try {
      const next = await recoveryRequest(user.id, `${prefix}-status-${action}`, action === "save" ? { enabled, sendTime: time, pagesPerKind: pages } : {}, service) as State;
      if (version !== generation.current) return;
      setState(next);
      if (action === "save") { setTime(next.settings.send_time); setPages(next.settings.pages_per_kind || 1); onChange?.(); toast.success("Agendamento salvo."); }
      else { setNotice("Fila solicitada. Acompanhe abaixo: as imagens pendentes serão publicadas uma por vez, sem repetir as confirmadas."); toast.success("Fila de Status solicitada."); }
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { mutating.current = false; setBusy(false); }
  };
  const title = category === "games" ? "Jogos de hoje" : "Lançamentos de filmes e séries";
  const current = (state?.posts || []).filter(post => post.post_day === today && (!post.banner_day || post.banner_day === today));
  const postLabel = (post: StatusPost) => post.region ? post.region === "national" ? "Nacional" : "Internacional" : post.kind === "movie" ? "Filmes" : "Séries";
  return <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">{title} · publicação no Status</h3><p className="mt-1 max-w-2xl text-xs text-muted-foreground">{category === "games" ? "Publica somente os banners nacionais e internacionais do dia atual." : "Publica filmes e séries em banners separados, com até quatro títulos únicos por imagem."} Visível aos contatos do WhatsApp conectado. O envio é apenas para o Status.</p></div>
      <Button disabled={busy || !state || (summary.pending > 0 || preparing) && !state?.settings.last_error} onClick={() => void mutate("post-now")}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{(preparing || summary.pending > 0) && !state?.settings.last_error ? "Fila em andamento" : "Postar agora"}
      </Button>
    </div>
    <div className="flex flex-wrap items-end gap-4 border-t pt-4">
      <div className="flex items-center gap-2"><Switch id={`auto-${category}`} checked={state?.settings.enabled === true} disabled={busy || !state} onCheckedChange={enabled => void mutate("save", enabled)} /><Label htmlFor={`auto-${category}`}>Postar automaticamente</Label></div>
      <div className="space-y-1"><Label htmlFor={`time-${category}`} className="text-xs">Horário diário · Brasília</Label><Input id={`time-${category}`} type="time" className="w-36" value={time} disabled={busy || !state} onChange={e => setTime(e.target.value)} /></div>
      {category === "catalog" && <div className="space-y-1"><Label htmlFor="catalog-pages" className="text-xs">Banners por categoria</Label><select id="catalog-pages" className="block h-10 rounded-md border bg-background px-3 text-sm" value={pages} disabled={busy || !state} onChange={e => setPages(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n} de filmes + {n} de séries</option>)}</select></div>}
      <Button size="sm" variant="outline" disabled={busy || !state || time === state.settings.send_time && pages === (state.settings.pages_per_kind || 1)} onClick={() => void mutate("save")}>Salvar agendamento</Button>
    </div>
    <p className="text-xs text-muted-foreground">{state?.settings.enabled ? `Automático ligado às ${state.settings.send_time} · funciona com o site fechado.` : "Automático desligado. Postar agora funciona independentemente do agendamento."} A fila continua no servidor; {category === "games" ? "jogos sem confirmação são conferidos e podem receber uma única nova tentativa após 10 minutos, com risco de duplicidade." : "páginas sem confirmação não são repetidas automaticamente."}</p>
    <p className="text-xs text-muted-foreground">Legenda: Comente “teste” para testar grátis.</p>
    {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {state?.settings.last_error && <p role="alert" className="text-sm text-amber-600">{state.settings.last_error}</p>}
    {state?.settings.cooldown_until && Date.parse(state.settings.cooldown_until)>Date.now() && summary.pending>0 && <p role="status" className="text-xs text-muted-foreground">Próximo envio a partir de {new Date(state.settings.cooldown_until).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"})} · Brasília. A fila continua automaticamente.</p>}
    <div className="space-y-2 rounded-lg border bg-background p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{preparing ? "Preparando a fila…" : summary.label}</strong><Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar fila</Button></div>
      {!!summary.total && <><progress className="h-2 w-full accent-teal-600" aria-label="Status confirmados" value={summary.sent} max={summary.total} /><p className="text-xs text-muted-foreground">{summary.sent}/{summary.total} confirmados · {summary.pending} pendentes · {summary.awaiting} sem confirmação · {summary.failed} com erro</p></>}
      {current.map(post => <p key={post.id} className="flex flex-wrap justify-between gap-1 border-t pt-2 text-xs"><span>{postLabel(post)} · página {post.page + 1}/{post.total}</span><span>{labels[post.status] || post.status}</span>{post.error && <span className="w-full text-amber-600">{post.error}</span>}</p>)}
    </div>
    {(state?.posts || []).some(post => post.post_day !== today) && <details className="text-xs"><summary className="cursor-pointer">Histórico dos outros dias</summary><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{state!.posts.filter(post => post.post_day !== today).map(post => <p key={post.id}>{post.post_day.split("-").reverse().join("/")} · {postLabel(post)} · {post.page + 1}/{post.total} · {labels[post.status] || post.status}</p>)}</div></details>}
  </section>;
}
