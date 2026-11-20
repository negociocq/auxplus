import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { recoveryRequest } from "@/lib/whatsappRecovery";

const defaultMessage = "{getGreeting}\n\nVocê já foi nosso cliente de *IPTV* 📺\n\n👤 *Seu usuário anterior:* `{item_id}`\n\nQuer experimentar nosso serviço novamente? Podemos liberar um *teste grátis, sem compromisso*.\n\n*1 — Quero experimentar*\n*2 — Parar de receber mensagens*";
type Candidate = { itemRef: string; username: string; name: string; dueDate: string };
type Campaign = { id: string; status: string; message: string; interval_seconds: number; last_error?: string };
type Contact = { id: string; campaign_id: string; username: string; status: string; reason?: string };
const labels: Record<string,string> = { paused:"Pausada",running:"Enviando",completed:"Concluída",cancelled:"Cancelada",queued:"Na fila",sending:"Enviando",invited:"Convite enviado",accepted:"Aceitou o teste",creating:"Criando teste",trial:"Teste criado",activated:"Teste ativado",opted_out:"Não enviar mais",skipped:"Ignorado",failed:"Precisa de atenção",uncertain:"Confira o envio" };

export function WhatsAppRecovery({userId}:{userId:string}) {
  const [message,setMessage]=useState(defaultMessage);
  const [limit,setLimit]=useState(10);
  const [interval,setIntervalSeconds]=useState(120);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const working=useRef(false);
  const live=campaigns.find(c=>["running","paused"].includes(c.status));
  useEffect(()=>{if(live){setMessage(live.message);setIntervalSeconds(live.interval_seconds);}},[live?.id,live?.message,live?.interval_seconds]);
  const refresh=useCallback(async(action="status")=>{
    const result=await recoveryRequest(userId,action);
    setCampaigns(result.campaigns||[]);setContacts(result.contacts||[]);setError("");
  },[userId]);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{
      if(working.current)return;working.current=true;
      void refresh(live?.status==="running"?"tick":"status").catch(e=>setError(e.message)).finally(()=>{working.current=false;});
    },15000);
    return ()=>window.clearInterval(timer);
  },[refresh,live?.status]);
  async function perform(task:()=>Promise<void>){
    if(working.current)return;working.current=true;setBusy(true);
    try{await task();setError("");}catch(e){const text=e instanceof Error?e.message:"Não foi possível concluir.";setError(text);toast.error(text);}finally{working.current=false;setBusy(false);}
  }
  async function loadCandidates(){
    await perform(async()=>{const result=await recoveryRequest(userId,"candidates");setCandidates(result.candidates);setSelected(result.candidates.slice(0,limit).map((i:Candidate)=>i.itemRef));if(!result.candidates.length)toast.message("Nenhum cliente antigo disponível para recuperação.");});
  }
  async function manage(action:string){
    if(!live)return;
    await perform(async()=>{await recoveryRequest(userId,action,{campaignId:live.id});await refresh();toast.success(action==="start"?"Fila iniciada":action==="pause"?"Fila pausada":"Fila cancelada");});
  }
  const currentContacts=live?contacts.filter(c=>c.campaign_id===live.id):contacts;
  return <section className="ax-surface space-y-5 p-4 sm:p-5">
    <div><h2 className="font-semibold">Recuperar clientes</h2><p className="mt-1 text-sm text-muted-foreground">Convide antigos clientes com acesso vencido e lista já excluída do UniPlay. O teste só é criado quando responderem 1.</p></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-2"><Label htmlFor="recovery-message">Mensagem de recuperação</Label><Textarea id="recovery-message" value={message} onChange={e=>setMessage(e.target.value)} rows={10} maxLength={3000} disabled={!!live}/><p className="text-xs text-muted-foreground">Use {"{getGreeting}"} e {"{item_id}"}. Mantenha 1 para experimentar e 2 para parar de receber. A mensagem fica salva com o lote.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-2"><Label htmlFor="recovery-limit">Clientes por lote</Label><Input id="recovery-limit" className="w-28" type="number" min={1} max={100} value={limit} disabled={!!live} onChange={e=>{const n=Math.max(1,Math.min(100,Number(e.target.value)||1));setLimit(n);setSelected(candidates.slice(0,n).map(c=>c.itemRef));}}/></div>
      <div className="space-y-2"><Label htmlFor="recovery-interval">Intervalo (segundos)</Label><Input id="recovery-interval" className="w-32" type="number" min={60} max={3600} value={interval} disabled={!!live} onChange={e=>setIntervalSeconds(Math.max(60,Math.min(3600,Number(e.target.value)||120)))}/></div>
      <Button variant="outline" disabled={busy||!!live} onClick={()=>void loadCandidates()}>{busy?"Aguarde…":"Buscar clientes antigos"}</Button>
    </div>
    {!live&&candidates.length>0&&<>
      <p className="text-sm">{selected.length} selecionado(s) de {candidates.length} disponíveis</p>
      <div className="max-h-72 overflow-auto rounded-md border divide-y">{candidates.map(c=><label key={c.itemRef} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" checked={selected.includes(c.itemRef)} disabled={busy||(!selected.includes(c.itemRef)&&selected.length>=limit)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,c.itemRef]:prev.filter(id=>id!==c.itemRef))}/><span className="min-w-0"><span className="font-mono font-medium">{c.username}</span>{c.name&&<span className="ml-2 text-muted-foreground">{c.name}</span>}<span className="block text-xs text-muted-foreground">Venceu em {String(c.dueDate).slice(0,10).split("-").reverse().join("/")}</span></span></label>)}</div>
      <Button disabled={busy||!selected.length} onClick={()=>void perform(async()=>{await recoveryRequest(userId,"create",{message,itemRefs:selected,intervalSeconds:interval});setCandidates([]);setSelected([]);await refresh();toast.success("Lote preparado. Clique em Iniciar fila para enviar.");})}>Preparar lote de {selected.length} clientes</Button>
    </>}
    {live&&<div className="space-y-3 rounded-md border p-3">
      {live.last_error&&<p role="alert" className="text-sm text-destructive">{live.last_error}</p>}
      <div className="flex flex-wrap items-center gap-2"><strong>Fila de recuperação</strong><Badge variant="secondary">{labels[live.status]}</Badge><span className="text-xs text-muted-foreground">{live.interval_seconds}s entre contatos · {currentContacts.filter(c=>c.status==="queued").length} aguardando</span></div>
      <p className="text-xs text-muted-foreground">Um contato por vez. A fila permanece salva ao fechar a página; em segundo plano, os envios seguem a verificação automática a cada 5 minutos. Ao terminar, o próximo lote depende de você.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy||live.status==="running"} onClick={()=>void manage("start")}>Iniciar fila</Button><Button variant="outline" disabled={busy||live.status!=="running"} onClick={()=>void manage("pause")}>Pausar</Button><Button variant="outline" disabled={busy} onClick={()=>void manage("cancel")}>Cancelar pendentes</Button></div>
      <p className="text-xs text-muted-foreground">Pausar ou cancelar não interrompe uma mensagem que já está sendo enviada.</p>
    </div>}
    {contacts.length>0&&<div className="space-y-2"><h3 className="text-sm font-semibold">Histórico de recuperação</h3><div className="max-h-80 divide-y overflow-auto rounded-md border">{contacts.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span className="font-mono">{c.username}</span><Badge variant="secondary">{labels[c.status]||c.status}</Badge>{c.reason&&<p className="w-full text-xs text-muted-foreground">{c.reason}</p>}</div>)}</div></div>}
  </section>;
}
