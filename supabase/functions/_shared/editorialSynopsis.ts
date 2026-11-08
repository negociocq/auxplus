import type { CatalogDisplayTitle } from '../../../src/lib/catalogBrowsing.ts';
import { catalogReferenceId } from '../../../src/lib/catalogPopularity.ts';
import { shortSynopsis,wikipediaSynopsis } from '../../../src/lib/catalogSynopsis.ts';
const cache=new Map<string,{text:string;source:string;expires:number}>();
const pending=new Map<string,Promise<{text:string;source:string}>>();
export async function titleSynopsis(title:CatalogDisplayTitle,fetcher:typeof fetch=fetch):Promise<CatalogDisplayTitle>{
  if(title.synopsis&&shortSynopsis(title.synopsis).length>=40)return {...title,synopsis:shortSynopsis(title.synopsis)};
  const id=catalogReferenceId(title);if(!id||!/^Q\d+$/.test(id))return title;
  const previous=cache.get(id);if(previous&&previous.expires>Date.now())return {...title,synopsis:previous.text||undefined,synopsisSource:previous.source||undefined};
  if(!pending.has(id))pending.set(id,(async()=>{
    const headers={'User-Agent':'AuxPlusEditorial/1.0 (Portuguese synopsis excerpts; contact https://auxplus.vercel.app)','Accept':'application/json'};
    const entityResponse=await fetcher(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,{headers,signal:AbortSignal.timeout(8000)});
    if(!entityResponse.ok)throw Error('Synopsis reference unavailable');
    const entity=await entityResponse.json(),page=entity.entities?.[id]?.sitelinks?.ptwiki?.title;
    if(typeof page!=='string'||page.length>300)return {text:'',source:''};
    const params=new URLSearchParams({action:'parse',page,prop:'text',format:'json',formatversion:'2',redirects:'1'});
    const response=await fetcher(`https://pt.wikipedia.org/w/api.php?${params}`,{headers,signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Synopsis text unavailable');
    const data=await response.json(),html=data.parse?.text;
    const text=typeof html==='string'?wikipediaSynopsis(html):'';
    const source=text?(Number.isInteger(data.parse?.pageid)&&data.parse.pageid>0?`https://pt.wikipedia.org/?curid=${data.parse.pageid}`:`https://pt.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g,'_'))}`):'';
    cache.set(id,{text,source,expires:Date.now()+(text?7*86400000:3600000)});
    while(cache.size>300)cache.delete(cache.keys().next().value!);
    return {text,source};
  })().catch(()=>({text:'',source:''})).finally(()=>pending.delete(id)));
  const result=await pending.get(id)!;
  return {...title,synopsis:result.text||undefined,synopsisSource:result.source||undefined};
}
export async function editorialSynopses(titles:CatalogDisplayTitle[]){
  const result:CatalogDisplayTitle[]=[];
  for(let i=0;i<titles.length;i+=2)result.push(...await Promise.all(titles.slice(i,i+2).map(t=>titleSynopsis(t))));
  return result;
}
