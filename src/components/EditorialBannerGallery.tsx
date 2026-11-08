import { useEffect, useRef, useState } from 'react';
import { Download, Expand, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { recoveryRequest } from '@/lib/whatsappRecovery';
import { brasiliaDay } from '@/lib/uniplayDiscover';
import type { EditorialPlan } from '@/lib/instagramEditorial';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Preview={plan:EditorialPlan;image:string;page:number;total:number;format:'feed'|'story'};
type Card={loading:boolean;data?:Preview;error?:string};
const cache=new Map<string,Preview>();
const pending=new Map<string,Promise<Preview>>();
async function requestPreview(userId:string,context:string,slot:string,format:'feed'|'story',page:number,force=false){
  const key=JSON.stringify([context,slot,format,page]);
  if(force)cache.delete(key);
  if(cache.has(key))return cache.get(key)!;
  if(!pending.has(key))pending.set(key,(async()=>{
    const result=await recoveryRequest(userId,'editorial-preview',{slot,format,page},'buffer-instagram');
    const preview=result.preview as Preview;
    if(!preview?.image||!Number.isInteger(preview.total)||preview.page!==page||preview.format!==format)throw new Error('A prévia não ficou pronta. Tente atualizar novamente.');
    cache.set(key,preview);while(cache.size>40)cache.delete(cache.keys().next().value!);
    return preview;
  })().finally(()=>pending.delete(key)));
  return pending.get(key)!;
}
export function EditorialBannerGallery({userId,channelId,slots}:{userId:string;channelId:string;slots:string[]}){
  const today=brasiliaDay(),slotKey=JSON.stringify(slots),context=JSON.stringify([userId,channelId,today,slots]);
  const [cards,setCards]=useState<Record<string,Card>>({}),[expanded,setExpanded]=useState<{slot:string;data:Preview}>();
  const [downloading,setDownloading]=useState('');
  const generation=useRef(0),requests=useRef<Record<string,number>>({});
  const load=async(slot:string,format:'feed'|'story'='feed',page=0,force=false)=>{
    const version=generation.current,request=(requests.current[slot]||0)+1;requests.current[slot]=request;
    setCards(current=>({...current,[slot]:{...current[slot],loading:true,error:undefined}}));
    try{
      const data=await requestPreview(userId,context,slot,format,page,force);
      if(version===generation.current&&requests.current[slot]===request)setCards(current=>({...current,[slot]:{loading:false,data}}));
    }catch(e){if(version===generation.current&&requests.current[slot]===request)setCards(current=>({...current,[slot]:{...current[slot],loading:false,error:e instanceof Error?e.message:'Não foi possível carregar a prévia.'}}));}
  };
  useEffect(()=>{
    const version=++generation.current;requests.current={};setCards({});setExpanded(undefined);
    // Prepare slots in order so the second selection can avoid the first one's titles.
    void(async()=>{for(const slot of slots){if(version!==generation.current)return;await load(slot);}})();
    return()=>{generation.current++;};
    // The serializable context changes only for account, date or saved slots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId,channelId,today,slotKey]);
  const download=async(slot:string,data:Preview)=>{
    if(downloading)return;setDownloading(slot);
    try{
      const response=await fetch(data.image,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Não foi possível baixar a imagem.');
      const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`auxplus-filmes-series-${today}-${slot.replace(':','')}-${data.format}-${data.page+1}.png`;document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){toast.error(e instanceof Error?e.message:'Falha ao baixar a imagem.');}
    finally{setDownloading('');}
  };
  return <section id="editorial-gallery" className="scroll-mt-24 space-y-4">
    <div><h3 className="font-semibold">Filmes e séries de hoje</h3><p className="mt-1 text-sm text-muted-foreground">Confira as duas seleções do dia. A capa apresenta os títulos; nas próximas páginas, veja a sinopse curta de cada filme ou série.</p></div>
    <div className="grid gap-6 md:grid-cols-2">{slots.map(slot=>{
      const card=cards[slot],data=card?.data,loading=!card||card.loading;
      return <article key={slot} className="space-y-3 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">Hoje · {slot} · Brasília</h4><Button size="sm" variant="ghost" disabled={loading} onClick={()=>void load(slot,data?.format||'feed',data?.page||0,true)}><RefreshCw className={`mr-1 h-4 w-4 ${loading?'animate-spin':''}`}/>Atualizar</Button></div>
        <div className="flex gap-2" role="group" aria-label={`Formato da seleção das ${slot}`}><Button size="sm" variant={data?.format!=='story'?'default':'outline'} disabled={loading} onClick={()=>void load(slot,'feed',data?.page||0)}>Carrossel</Button><Button size="sm" variant={data?.format==='story'?'default':'outline'} disabled={loading} onClick={()=>void load(slot,'story',data?.page||0)}>Stories</Button></div>
        {data&&<p className="min-h-6 text-sm font-medium">{data.plan.headline}</p>}
        {loading&&!data?<div className="flex aspect-[4/5] items-center justify-center rounded-lg bg-muted" role="status"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Preparando a seleção…</div>:data?<button type="button" className="relative block w-full overflow-hidden rounded-lg border" onClick={()=>setExpanded({slot,data})} aria-label={`Ampliar ${data.plan.headline}, página ${data.page+1}`}><img src={data.image} alt={`${data.plan.headline} · ${data.page===0?'capa':`página ${data.page+1} com sinopses`}`} className={`w-full ${data.format==='story'?'aspect-[9/16]':'aspect-[4/5]'}`}/>{loading&&<span className="absolute inset-0 flex items-center justify-center bg-background/60"><Loader2 className="h-7 w-7 animate-spin"/></span>}</button>:null}
        {card?.error&&<p role="alert" className="text-sm text-destructive">{card.error}</p>}
        {data&&<><div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={loading||data.page===0} onClick={()=>void load(slot,data.format,data.page-1)}>Anterior</Button><span className="text-xs">{data.page+1} de {data.total}</span><Button size="sm" variant="outline" disabled={loading||data.page+1>=data.total} onClick={()=>void load(slot,data.format,data.page+1)}>Próxima</Button></div><div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" disabled={loading} onClick={()=>setExpanded({slot,data})}><Expand className="mr-2 h-4 w-4"/>Visualizar</Button><Button size="sm" disabled={loading||Boolean(downloading)} onClick={()=>void download(slot,data)}><Download className="mr-2 h-4 w-4"/>Baixar PNG</Button></div></>}
      </article>;
    })}</div>
    <Dialog open={Boolean(expanded)} onOpenChange={open=>{if(!open)setExpanded(undefined);}}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{expanded?.data.plan.headline}</DialogTitle><DialogDescription>{expanded?.slot} · Brasília · página {(expanded?.data.page||0)+1} de {expanded?.data.total}</DialogDescription></DialogHeader>{expanded&&<><img src={expanded.data.image} alt={expanded.data.plan.headline} className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"/><Button disabled={Boolean(downloading)} onClick={()=>void download(expanded.slot,expanded.data)}><Download className="mr-2 h-4 w-4"/>Baixar PNG</Button></>}</DialogContent></Dialog>
  </section>;
}
