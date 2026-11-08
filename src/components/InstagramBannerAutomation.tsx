import { useEffect, useRef, useState } from 'react';
import { Instagram } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { recoveryRequest } from '@/lib/whatsappRecovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EditorialBannerGallery } from '@/components/EditorialBannerGallery';
type Channel = {id:string;name:string};
type State = {connected:boolean;channels?:Channel[];settings:{channel_id?:string;channel_name?:string;enabled:boolean;feed:boolean;stories:boolean;send_time:string;last_error?:string;editorial_enabled?:boolean;editorial_times?:string[]};posts:{id:string;post_day:string;kind:string;batch:number;status:string;error?:string;topic?:string;edition?:string}[]};
const labels:Record<string,string>={queued:'Na fila do AuxPlus',submitting:'Enviando ao Buffer',accepted:'Recebido pelo Buffer',uncertain:'Sem confirmação — confira no Buffer',failed:'Recusado pelo Buffer',cancelled:'Cancelado'};
export function InstagramBannerAutomation({category='games'}:{category?:'games'|'editorial'}) {
  const isGames=category==='games';
  const {user}=useApp();
  const [state,setState]=useState<State>(),[channels,setChannels]=useState<Channel[]>([]);
  const [key,setKey]=useState(''),[channel,setChannel]=useState(''),[time,setTime]=useState('07:00');
  const [enabled,setEnabled]=useState(false),[feed,setFeed]=useState(true),[stories,setStories]=useState(true);
  const [editorialEnabled,setEditorialEnabled]=useState(false),[editorialTimes,setEditorialTimes]=useState(['12:00','16:00']);
  const [slot,setSlot]=useState('12:00');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),mutating=useRef(false),formRevision=useRef(0);
  const apply=(next:State,form=false)=>{setState(next);if(next.channels)setChannels(next.channels);if(form){setChannel(next.settings.channel_id||next.channels?.[0]?.id||'');setTime(next.settings.send_time);setEnabled(next.settings.enabled);setFeed(next.settings.feed);setStories(next.settings.stories);setEditorialEnabled(next.settings.editorial_enabled===true);setEditorialTimes(next.settings.editorial_times||['12:00','16:00']);setSlot(next.settings.editorial_times?.[0]||'12:00');}};
  useEffect(()=>{
    const version=++generation.current;setState(undefined);setChannels([]);setKey('');setError('');
    const load=async(initial=false)=>{if(!user?.id||mutating.current)return;const revision=formRevision.current;try{const next=await recoveryRequest(user.id,'state',{},'buffer-instagram') as State;if(version===generation.current&&revision===formRevision.current)apply(next,initial);if(initial&&next.connected){const accounts=await recoveryRequest(user.id,'channels',{},'buffer-instagram') as State;if(version===generation.current&&revision===formRevision.current)apply(accounts,true);}}catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Falha ao consultar o Instagram.');}};
    void load(true);const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);
    return()=>{generation.current++;window.clearInterval(interval);};
  },[user?.id]);
  const action=async(kind:string)=>{
    if(!user?.id||busy)return;
    const version=generation.current;formRevision.current++;mutating.current=true;setBusy(true);setError('');
    try{
      const body=kind==='connect'?{apiKey:key}:kind==='save'?{enabled,feed,stories,sendTime:time,channelId:channel,editorialEnabled,editorialTimes}:kind.startsWith('editorial-')?{slot}:{};
      const next=await recoveryRequest(user.id,kind,body,'buffer-instagram') as State;
      if(version!==generation.current)return;
      apply(next,!['post-now','editorial-post-now','editorial-preview'].includes(kind));if(kind==='connect'||kind==='disconnect')setKey('');
      toast.success(kind==='editorial-preview'?'Prévia pronta. Nenhuma publicação foi enviada.':kind.endsWith('post-now')?'Fila solicitada. Acompanhe o envio abaixo.':kind==='connect'?'Buffer conectado. Escolha o Instagram e salve o agendamento.':'Configuração salva.');
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Não foi possível concluir.');}
    finally{mutating.current=false;setBusy(false);}
  };
  const dirty=state&&(channel!==(state.settings.channel_id||'')||time!==state.settings.send_time||enabled!==state.settings.enabled||feed!==state.settings.feed||stories!==state.settings.stories||editorialEnabled!==(state.settings.editorial_enabled===true)||JSON.stringify(editorialTimes)!==JSON.stringify(state.settings.editorial_times||['12:00','16:00']));
  return <><section className="space-y-4 rounded-xl border bg-muted/20 p-4">
    <div><h3 className="flex items-center gap-2 font-semibold"><Instagram className="h-4 w-4"/>Instagram pelo Buffer · {isGames?'Jogos':'Filmes e séries'}</h3><p className="mt-1 text-xs text-muted-foreground">{isGames?'Publique os jogos de hoje nos Stories e no feed em carrossel.':'Publique seleções de filmes e séries nos Stories e no feed em carrossel.'}</p></div>
    {!state?.connected?<div className="space-y-2"><p className="text-sm">Conecte seu Instagram no Buffer e gere uma chave em <a href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer" className="underline">Buffer → Configurações → API</a>.</p><Label htmlFor="buffer-key">Chave de API do Buffer</Label><div className="flex flex-wrap gap-2"><Input id="buffer-key" type="password" autoComplete="off" className="max-w-md" value={key} onChange={e=>setKey(e.target.value)} placeholder="Cole a chave aqui" disabled={busy||!state}/><Button disabled={busy||!state||!key.trim()} onClick={()=>void action('connect')}>Conectar Buffer</Button></div><p className="text-xs text-muted-foreground">A chave é guardada no servidor e não aparece novamente no painel.</p></div>:<>
      <p className="text-sm">Buffer conectado{state.settings.channel_name?` · ${state.settings.channel_name}`:''}. <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="underline">Abrir Buffer</a></p>
      <div className="flex flex-wrap items-end gap-4"><div className="space-y-1"><Label htmlFor="buffer-channel">Instagram</Label><select id="buffer-channel" value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)} className="block h-10 rounded-md border bg-background px-3 text-sm"><option value="">Selecione a conta</option>{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>{isGames&&<div className="space-y-1"><Label htmlFor="buffer-time">Horário diário · Brasília</Label><Input id="buffer-time" type="time" value={time} disabled={busy} onChange={e=>setTime(e.target.value)} className="w-36"/></div>}</div>
      <div className="flex flex-wrap gap-5"><div className="flex items-center gap-2"><Switch id="buffer-feed" checked={feed} disabled={busy} onCheckedChange={setFeed}/><Label htmlFor="buffer-feed">Carrossel no feed</Label></div><div className="flex items-center gap-2"><Switch id="buffer-stories" checked={stories} disabled={busy} onCheckedChange={setStories}/><Label htmlFor="buffer-stories">Stories</Label></div>{isGames&&<div className="flex items-center gap-2"><Switch id="buffer-enabled" checked={enabled} disabled={busy} onCheckedChange={setEnabled}/><Label htmlFor="buffer-enabled">Postar automaticamente</Label></div>}</div>
      {!isGames&&<div className="space-y-3 rounded-lg border p-3"><h4 className="font-medium">Filmes e séries · duas seleções por dia</h4><p className="text-xs text-muted-foreground">Lançamentos recentes, novas temporadas confirmadas, ficção científica, suspense, ação, comédia e outras seleções com títulos conhecidos do catálogo. Os temas variam; cada seleção evita repetir títulos dos últimos dias.</p><div className="flex flex-wrap items-end gap-4"><div className="flex items-center gap-2"><Switch id="buffer-editorial" checked={editorialEnabled} disabled={busy} onCheckedChange={setEditorialEnabled}/><Label htmlFor="buffer-editorial">Publicar filmes e séries</Label></div>{editorialTimes.map((value,index)=><div key={index} className="space-y-1"><Label htmlFor={`editorial-time-${index}`}>{index+1}º horário · Brasília</Label><Input id={`editorial-time-${index}`} type="time" value={value} disabled={busy} className="w-36" onChange={e=>setEditorialTimes(current=>current.map((t,i)=>i===index?e.target.value:t))}/></div>)}</div><div className="flex flex-wrap items-center gap-2"><Label htmlFor="editorial-slot">Seleção</Label><select id="editorial-slot" value={slot} disabled={busy} onChange={e=>{setSlot(e.target.value);}} className="h-9 rounded-md border bg-background px-2 text-sm">{(state.settings.editorial_times||['12:00','16:00']).map(t=><option key={t} value={t}>{t}</option>)}</select><Button variant="outline" disabled={busy||!state.settings.channel_id||Boolean(dirty)} onClick={()=>document.getElementById('editorial-gallery')?.scrollIntoView({behavior:'smooth'})}>Ver prévia</Button><Button variant="outline" disabled={busy||!state.settings.channel_id||Boolean(dirty)} onClick={()=>void action('editorial-post-now')}>Publicar esta seleção agora</Button></div></div>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy||!channel||!feed&&!stories} onClick={()=>void action('save')}>Salvar agendamento</Button>{isGames&&<Button variant="outline" disabled={busy||!state.settings.channel_id||Boolean(dirty)} onClick={()=>void action('post-now')}>Publicar jogos de hoje</Button>}<Button variant="ghost" disabled={busy} onClick={()=>void action('channels')}>Atualizar contas</Button><Button variant="ghost" disabled={busy} onClick={()=>void action('disconnect')}>Desconectar</Button></div>
      {dirty&&<p className="text-xs text-muted-foreground">Salve as alterações antes de publicar.</p>}
      <p className="text-xs text-muted-foreground">O envio diário funciona com o site fechado. O Buffer conclui a publicação; se solicitar uma notificação, finalize pelo aplicativo Buffer no celular. Postagens recebidas ou sem confirmação não são repetidas automaticamente.</p>
    </>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {state?.settings.last_error&&<p role="alert" className="text-sm text-amber-600">{state.settings.last_error}</p>}
    {!!state?.posts.filter(p=>(p.topic||'games')===(isGames?'games':'editorial')).length&&<details open><summary className="cursor-pointer text-sm">Envios ao Buffer</summary><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{state.posts.filter(p=>(p.topic||'games')===(isGames?'games':'editorial')).map(p=><div key={p.id} className="border-t pt-2 text-xs"><p>{p.post_day.split('-').reverse().join('/')} {p.topic==='editorial'?` · Filmes/séries ${p.edition}`:' · Jogos'} · {p.kind==='feed'?'Carrossel':'Story'} {p.batch+1} · {labels[p.status]||p.status}</p>{p.error&&<p className="mt-1 text-amber-600">{p.error}</p>}</div>)}</div></details>}
  </section>{!isGames&&state?.connected&&state.settings.channel_id&&user?.id&&<EditorialBannerGallery userId={user.id} channelId={state.settings.channel_id} slots={state.settings.editorial_times||['12:00','16:00']}/>}</>;
}
