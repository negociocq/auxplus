import { contentCatalog } from './contentStatus.ts';
import { editorialPlan, editorialSlides, editorialSvg, editorialThemeForSlot, editorialAssetPath, type EditorialPlan, type EditorialSlide } from '../../../src/lib/instagramEditorial.ts';
import { editorialSynopses } from './editorialSynopsis.ts';
import { getCatalogGenreGuide } from '../../../scripts/lib/catalog-genre-guide.mjs';
import { getRecentSeasons } from '../../../scripts/lib/recent-seasons.mjs';
import { genreIdentity, matchPublicGenreGuide, matchRecentSeasonGuide } from '../../../src/lib/catalogGenreIdentity.mjs';
export { editorialSlides };

const cache=new Map<string,{expires:number;items:any[]}>();
async function catalog(db:any,userId:string,day:string){
  if((cache.get(userId)?.expires||0)>Date.now())return cache.get(userId)!.items;
  const year=Number(day.slice(0,4));
  const [items,genres,seasons]=await Promise.all([
    contentCatalog(db,userId),Promise.all([year,year-1,year-2].map(y=>getCatalogGenreGuide('movie',y).catch(()=>null))),getRecentSeasons(fetch,Date.parse(`${day}T12:00:00Z`)).catch(()=>null),
  ]);
  const genreMatches=matchPublicGenreGuide(items,genres.flatMap(guide=>guide?.candidates||[]));
  const seasonMatches=seasons?matchRecentSeasonGuide(items,seasons.candidates,Date.parse(`${day}T23:59:59-03:00`)):{};
  const enriched=items.map(t=>({...t,...(genreMatches[genreIdentity(t).key]?{genres:genreMatches[genreIdentity(t).key].genres,genreSource:genreMatches[genreIdentity(t).key].source}:{}),...(seasonMatches[t.key]?{seasonReference:seasonMatches[t.key]}:{})}));
  cache.set(userId,{expires:Date.now()+20*60000,items:enriched});
  while(cache.size>10)cache.delete(cache.keys().next().value!);
  return enriched;
}
export async function prepareEditorialPlan(db:any,userId:string,day:string,slot='12:00'):Promise<EditorialPlan>{
  const history=await db.from('instagram_editorial_plans').select('post_day,payload').eq('user_id',userId).order('post_day',{ascending:false}).limit(30);
  if(history.error)throw new Error('Não foi possível conferir as seleções anteriores.');
  const cutoff=Date.parse(`${day}T12:00:00Z`)-6*86400000;
  const used=(history.data||[]).filter((p:any)=>Date.parse(`${p.post_day}T12:00:00Z`)>=cutoff).flatMap((p:any)=>p.payload?.keys||[]);
  const theme=editorialThemeForSlot(day,slot);
  const plan=editorialPlan(await catalog(db,userId,day),day,used,theme);
  const titles=await editorialSynopses(plan.titles);
  const sources=[...new Set(titles.map(t=>t.synopsisSource).filter((s):s is string=>!!s&&s.startsWith('https://pt.wikipedia.org/')))];
  const attribution=sources.length?`\n\nSinopses: trechos reduzidos da Wikipédia (CC BY-SA 4.0).\n${sources.join('\n')}\nhttps://creativecommons.org/licenses/by-sa/4.0/`:'';
  return {...plan,titles,caption:plan.caption+attribution};
}
export async function getEditorialPlan(db:any,userId:string,day:string,slot:string,channelId:string):Promise<EditorialPlan>{
  const lookup=()=>db.from('instagram_editorial_plans').select('payload').eq('user_id',userId).eq('post_day',day).eq('channel_id',channelId).eq('slot',slot).maybeSingle();
  const saved=await lookup();if(saved.error)throw new Error('Não foi possível consultar a seleção.');
  if(saved.data?.payload)return saved.data.payload;
  const plan=await prepareEditorialPlan(db,userId,day,slot);
  const result=await db.from('instagram_editorial_plans').upsert({user_id:userId,post_day:day,channel_id:channelId,slot,payload:plan},{onConflict:'user_id,post_day,channel_id,slot',ignoreDuplicates:true});
  if(result.error)throw new Error('Não foi possível guardar a seleção.');
  const canonical=await lookup();if(canonical.error||!canonical.data?.payload)throw new Error('Não foi possível confirmar a seleção.');
  return canonical.data.payload;
}
let renderer:Promise<{module:any;fonts:Uint8Array[]}>|undefined;
async function loadRenderer(){
  if(!renderer)renderer=(async()=>{
    const hashes:Record<string,string>={'resvg.wasm':'22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70','Roboto.ttf':'d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134','Roboto-Bold.ttf':'61f89f8db49261c2f6106e8dccc35df7b2f7ed909020db40a3fc905e95f99334'};
    const assets=await Promise.all(Object.entries(hashes).map(async([name,hash])=>{
      const r=await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/football-renderer/v1/${name}`,{signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error('O gerador de imagens está indisponível.');
      const bytes=new Uint8Array(await r.arrayBuffer());
      const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==hash)throw new Error('Não foi possível verificar os arquivos do gerador.');
      return bytes;
    }));
    const module=await import('npm:@resvg/resvg-wasm@2.6.2');await module.initWasm(assets[0]);
    return{module,fonts:assets.slice(1)};
  })().catch(error=>{renderer=undefined;throw error;});
  return renderer;
}
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export async function renderEditorialSlide(slide:EditorialSlide,format:'feed'|'story'){
  const [{module,fonts},images]=await Promise.all([loadRenderer(),Promise.all(slide.titles.map(async title=>{
    if(!title.image||!/^https:\/\/image\.tmdb\.org\//.test(title.image))throw new Error('Capa não verificada.');
    const url=new URL(title.image);url.pathname=url.pathname.replace(/\/t\/p\/[^/]+\//,'/t/p/w500/');
    const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok)throw new Error('Não foi possível carregar a capa do título.');
    const mime=response.headers.get('content-type')?.split(';')[0];
    if(!['image/jpeg','image/png','image/webp'].includes(mime||''))throw new Error('Formato de capa inválido.');
    const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>2500000)throw new Error('Capa muito grande.');
    return[title.key,`data:${mime};base64,${base64(bytes)}`];
  }))]);
  const svg=editorialSvg(slide,format,Object.fromEntries(images));
  const resvg=new module.Resvg(svg,{fitTo:{mode:'width',value:format==='feed'?1080:720},font:{fontBuffers:fonts,loadSystemFonts:false,defaultFontFamily:'Roboto'}});
  const raster=resvg.render();try{return raster.asPng();}finally{raster.free();resvg.free();}
}
export async function editorialPreview(db:any,userId:string,day:string,slot='12:00',channelId:string,options:{page?:number;format?:'feed'|'story'}={}){
  const page=options.page??0,format=options.format??'feed';
  if(!Number.isInteger(page)||page<0||page>9||!['feed','story'].includes(format))throw new Error('Página de prévia inválida.');
  const plan=await getEditorialPlan(db,userId,day,slot,channelId),slides=editorialSlides(plan);
  if(!slides[page])throw new Error('Página de prévia indisponível.');
  const bucket=db.storage.from('instagram-banners'),file=editorialAssetPath(userId,plan,slot,format,page);
  const image=bucket.getPublicUrl(file).data.publicUrl;
  const exists=await fetch(image,{method:'HEAD',signal:AbortSignal.timeout(8000)});
  if(!exists.ok){
    const bytes=await renderEditorialSlide(slides[page],format);
    const upload=await bucket.upload(file,bytes,{contentType:'image/png',upsert:false});
    if(upload.error){const check=await fetch(image,{method:'HEAD',signal:AbortSignal.timeout(8000)});if(!check.ok)throw new Error('Não foi possível guardar a prévia.');}
  }
  return{plan,image,page,total:slides.length,format};
}
