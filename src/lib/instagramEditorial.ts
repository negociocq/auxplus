import type { CatalogTitle } from './uniplayDiscover.ts';
import { groupCatalogVariants, type CatalogDisplayTitle } from './catalogBrowsing.ts';
import { catalogRecognitionKey, catalogRecognitionScore, catalogWithReleaseEvidence } from './catalogPopularity.ts';
import { genreKey } from './catalogBrowsing.ts';
import { shortSynopsis } from './catalogSynopsis.ts';

export type EditorialTheme = 'releases' | 'seasons' | 'horror' | 'action' | 'weekend' | 'series' | 'year' | 'scifi' | 'suspense' | 'comedy' | 'adventure' | 'animation';
export const EDITORIAL_POLICY_VERSION=3;
export type EditorialPlan = { version:number; day:string; theme:EditorialTheme; headline:string; subtitle:string; criteria:string; titles:CatalogDisplayTitle[]; keys:string[]; caption:string };
export type EditorialSlide = { plan:EditorialPlan; index:number; total:number; titles:CatalogDisplayTitle[] };
export const EDITORIAL_WEEK:EditorialTheme[]=['releases','series','scifi','suspense','action','comedy','weekend','seasons','adventure','animation','year','horror','scifi','suspense'];
export function editorialThemeForSlot(day:string,slot:string):EditorialTheme {
  const days=Math.floor(Date.parse(`${day}T12:00:00Z`)/86400000);
  return EDITORIAL_WEEK[(days*2+(slot>='16:00'?1:0))%EDITORIAL_WEEK.length];
}
export function editorialMainstream(title:CatalogTitle):boolean {
  const recognized=catalogRecognitionKey(title).startsWith('wikidata:')&&catalogRecognitionScore(title)>=45;
  const rated=Number(title.voteCount)>=5000&&Number(title.rating)>=7;
  return (recognized||rated)&&(!title.rating||title.rating>=7);
}
const dayMs=86400000;
export function editorialPlan(items:CatalogTitle[],day:string,used:string[]=[],requested?:EditorialTheme):EditorialPlan {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(`${day}T12:00:00Z`)))throw new Error('Data editorial inválida.');
  const now=Date.parse(`${day}T23:59:59-03:00`),year=Number(day.slice(0,4)),seen=new Set(used);
  const unique=new Set<string>();
  const candidates=groupCatalogVariants(items.map(catalogWithReleaseEvidence))
    .filter(t=>!seen.has(t.key)&&!seen.has(catalogRecognitionKey(t))&&editorialMainstream(t)
      &&(!t.releasedAt||t.releasedAt<=now)&&(!t.releaseYear||t.releaseYear<=year)
      &&!!t.image&&/^https:\/\/image\.tmdb\.org\//.test(t.image))
    .sort((a,b)=>catalogRecognitionScore(b)-catalogRecognitionScore(a)||(b.rating||0)-(a.rating||0)||a.name.localeCompare(b.name,'pt-BR'))
    .filter(t=>{const key=catalogRecognitionKey(t);if(unique.has(key))return false;unique.add(key);return true;});
  const premiered=(t:CatalogTitle)=>t.releasedAt?new Date(t.releasedAt).getUTCFullYear():t.releaseYear;
  const recent=(t:CatalogTitle)=>!!t.releasedAt&&t.releasedAt<=now&&now-t.releasedAt<=120*dayMs;
  const genre=(t:CatalogTitle,...genres:string[])=>t.kind==='movie'&&Number(premiered(t))>=year-2&&t.genres?.some(g=>genres.includes(genreKey(g)))===true;
  const season=(t:CatalogTitle)=>{
    const ref=t.seasonReference,at=t.seasonReleasedAt||ref?.releasedAt;
    const number=t.latestSeason;
    return t.kind==='series'&&!!number&&number>1&&!!at&&at<=now&&now-at<=183*dayMs&&(!ref||number>=ref.number);
  };
  const rules:Record<EditorialTheme,{filter:(t:CatalogDisplayTitle)=>boolean;limit:number;title:(n:number)=>string;subtitle:string}>={
    releases:{filter:t=>t.kind==='movie'&&recent(t),limit:5,title:n=>`${n} lançamentos para assistir`,subtitle:'Filmes recentes e conhecidos'},
    seasons:{filter:season,limit:5,title:n=>`${n} séries com novas temporadas`,subtitle:'Novos episódios para maratonar'},
    horror:{filter:t=>genre(t,'terror'),limit:5,title:n=>`${n} filmes de terror famosos`,subtitle:'Uma seleção para quem gosta de sustos'},
    action:{filter:t=>genre(t,'acao'),limit:5,title:n=>`${n} filmes de ação famosos`,subtitle:'Grandes histórias para acelerar o ritmo'},
    scifi:{filter:t=>genre(t,'ficcao cientifica'),limit:5,title:n=>`${n} filmes de ficção científica`,subtitle:'Grandes sucessos para explorar outros mundos'},
    suspense:{filter:t=>genre(t,'suspense','misterio'),limit:5,title:n=>`${n} filmes de suspense`,subtitle:'Títulos famosos para prender sua atenção'},
    comedy:{filter:t=>genre(t,'comedia'),limit:5,title:n=>`${n} comédias para assistir`,subtitle:'Filmes conhecidos para dar boas risadas'},
    adventure:{filter:t=>genre(t,'aventura'),limit:5,title:n=>`${n} filmes de aventura`,subtitle:'Grandes sucessos para sua próxima sessão'},
    animation:{filter:t=>genre(t,'animacao'),limit:5,title:n=>`${n} animações para assistir`,subtitle:'Histórias famosas para curtir em família'},
    weekend:{filter:t=>t.kind==='movie'&&Number(premiered(t))>=year-2,limit:5,title:n=>`${n} filmes famosos para assistir`,subtitle:'Uma seleção para o seu fim de semana'},
    series:{filter:t=>t.kind==='series',limit:5,title:n=>`${n} séries famosas para maratonar`,subtitle:'Histórias que conquistaram o público'},
    year:{filter:t=>t.kind==='movie'&&premiered(t)===year,limit:5,title:n=>`${n} filmes de ${year} para assistir`,subtitle:'Destaques do ano no catálogo'},
  };
  const preferred=requested||editorialThemeForSlot(day,'12:00');
  const fallback:EditorialTheme[]=preferred==='seasons'||preferred==='series'?['series','year','weekend']:['year','releases','weekend','series'];
  for(const theme of [...new Set([preferred,...fallback])]){
    const rule=rules[theme];
    const sorted=candidates.filter(rule.filter);
    const titles=sorted.slice(0,rule.limit);
    if(titles.length<3)continue;
    const headline=rule.title(titles.length),criteria='Seleção editorial de títulos conhecidos disponíveis no catálogo. Não é um ranking oficial de crítica ou audiência.';
    const names=titles.map((t,i)=>`${i+1}. ${t.name}${theme==='seasons'&&t.latestSeason?` · ${t.latestSeason}ª temporada`:''}`).join('\n');
    return{version:EDITORIAL_POLICY_VERSION,day,theme,headline,subtitle:rule.subtitle,criteria,titles,keys:titles.flatMap(t=>[t.key,catalogRecognitionKey(t)]),caption:`🍿 ${headline}\n${rule.subtitle}\n\n${names}\n\nQual você vai assistir?\nPeça seu teste grátis pelo WhatsApp no link da bio.\n\n${criteria}`};
  }
  throw new Error('Não há títulos conhecidos suficientes para este tema sem repetir os últimos dias. O catálogo será conferido novamente.');
}
export function editorialSlides(plan:EditorialPlan):EditorialSlide[]{
  const total=1+Math.ceil(plan.titles.length/2);
  return Array.from({length:total},(_,index)=>({plan,index,total,titles:index===0?plan.titles.slice(0,4):plan.titles.slice((index-1)*2,index*2)}));
}
export function editorialAssetPath(userId:string,plan:EditorialPlan,slot:string,format:'feed'|'story',page:number){
  return `${userId}/${plan.day}/editorial-v${plan.version||1}-${slot.replace(':','')}-${format}-${page}.png`;
}
const xml=(value:unknown)=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function lines(text:string,max=33,limit=3){const result:string[]=[];let line='';for(const word of text.split(/\s+/)){if(line&&(line+' '+word).length>max){result.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)result.push(line);if(result.length>limit)result[limit-1]=result[limit-1].replace(/[\s,;]+$/,'')+'…';return result.slice(0,limit);}
/** Feed artwork is designed at 4:5; Stories extend the frame to 9:16 without cropping. */
export function editorialSvg(slide:EditorialSlide,format:'feed'|'story',posters:Record<string,string>={}){
  const h=format==='story'?1920:1350,offset=(h-1350)/2,accent=slide.plan.theme==='horror'?'#ff786c':'#65f2d1';
  const title=lines(slide.index===0?slide.plan.headline:slide.plan.subtitle,32);
  const cover=slide.index===0;
  const cards=slide.titles.map((item,i)=>{
    const single=!cover&&slide.titles.length===1;
    const x=70+i%2*480,y=cover?370+Math.floor(i/2)*280:340,w=single?940:445,ph=cover?205:single?820:460;
    const image=posters[item.key];
    const name=item.name.replace(/\s*\(\d{4}\)$/,'');
    const year=slide.plan.theme==='seasons'?`${item.latestSeason}ª temporada`:item.releasedAt?new Date(item.releasedAt).getUTCFullYear():item.releaseYear||'';
    const synopsis=shortSynopsis(item.synopsis,190)||'Sinopse ainda não disponível para este título.';
    const credit=item.synopsisSource?.startsWith('https://pt.wikipedia.org/')?'Fonte: Wikipédia · CC BY-SA':item.synopsis?'Fonte: catálogo':'';
    if(single)return `<g><rect x="${x}" y="${y}" width="940" height="820" rx="18" fill="#132331"/>${image?`<image href="${xml(image)}" x="${x}" y="${y}" width="410" height="820" preserveAspectRatio="xMidYMid slice"/>`:''}${lines(name,24,3).map((s,n)=>`<text x="520" y="${400+n*48}" fill="white" font-size="38" font-weight="700">${xml(s)}</text>`).join('')}<text x="520" y="570" fill="${accent}" font-size="25">${xml(year)}</text><text x="520" y="650" fill="${accent}" font-size="27" font-weight="700">Sinopse</text>${lines(synopsis,32,7).map((s,n)=>`<text x="520" y="${700+n*36}" fill="#dbe7ed" font-size="26">${xml(s)}</text>`).join('')}<text x="520" y="1125" fill="#a2bac4" font-size="18">${xml(credit)}</text></g>`;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${cover?265:820}" rx="18" fill="#132331"/>${image?`<image href="${xml(image)}" x="${x}" y="${y}" width="${w}" height="${ph}" preserveAspectRatio="xMidYMid slice"/>`:''}${lines(name,25,cover?1:2).map((s,n)=>`<text x="${x+18}" y="${y+ph+38+n*34}" fill="white" font-size="${cover?24:28}" font-weight="700">${xml(s)}</text>`).join('')}${!cover?`<text x="${x+18}" y="${y+ph+115}" fill="${accent}" font-size="24">${xml(year)}</text><text x="${x+18}" y="${y+ph+160}" fill="${accent}" font-size="24" font-weight="700">Sinopse</text>${lines(synopsis,35,5).map((s,n)=>`<text x="${x+18}" y="${y+ph+200+n*29}" fill="#dbe7ed" font-size="23">${xml(s)}</text>`).join('')}<text x="${x+18}" y="${y+805}" fill="#a2bac4" font-size="16">${xml(credit)}</text>`:''}</g>`;
  }).join('');
  const continuation = format==='story'?'Veja a seleção nos próximos Stories':'Veja a seleção nas próximas páginas';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#08121f"/><stop offset="1" stop-color="#183341"/></linearGradient></defs><rect width="1080" height="${h}" fill="url(#bg)"/><g font-family="Roboto,Arial,sans-serif" transform="translate(0 ${offset})"><text x="70" y="85" fill="${accent}" font-size="36" font-weight="700">AUXPLUS · FILMES E SÉRIES</text><text x="1010" y="85" text-anchor="end" fill="#c0d1db" font-size="24">${slide.index+1}/${slide.total}</text>${title.map((s,n)=>`<text x="70" y="${175+n*68}" fill="white" font-weight="700" font-size="58">${xml(s)}</text>`).join('')}${cards}<text x="70" y="${cover?1010:1190}" fill="${accent}" font-size="30">${cover?continuation:'Qual vai ser o seu próximo título?'}</text><rect x="60" y="1230" width="960" height="78" rx="20" fill="#146352"/><text x="540" y="1280" text-anchor="middle" fill="white" font-size="30" font-weight="700">Peça seu teste pelo link da bio</text></g></svg>`;
}
