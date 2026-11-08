import assert from 'node:assert/strict';
import sharp from 'sharp';
import { editorialPlan,editorialSlides,editorialSvg,editorialThemeForSlot,EDITORIAL_WEEK,editorialMainstream } from '../src/lib/instagramEditorial.ts';
import { groupCatalogVariants } from '../src/lib/catalogBrowsing.ts';
const day='2026-11-08',year=2026;
const fixture=(i,patch={})=>({key:`movie:${i}`,name:`Terror famoso ${i} (${year})`,kind:'movie',releaseYear:year,releasedAt:Date.parse('2026-09-01'),genres:['Terror'],voteCount:15000,rating:7.8,image:`https://image.tmdb.org/t/p/w500/${i}.jpg`,...patch});
const all=Array.from({length:12},(_,i)=>fixture(i));
all.push(fixture('old',{name:'Filme antigo (2020)',releaseYear:2020,releasedAt:Date.parse('2020-01-01')}));
all.push(fixture('future',{name:'Filme futuro (2027)',releaseYear:2027,releasedAt:Date.parse('2027-01-01')}));
all.push(fixture('obscure',{voteCount:20,rating:9}));
all.push(fixture('bad',{voteCount:5000,rating:3}));
all.push(fixture('wrong-genre',{genres:['Comédia']}));
all.push(fixture('alias',{name:'Terror famoso 0 (2026) LEG'}));
const horror=editorialPlan(all,day,[],'horror');
assert.equal(horror.theme,'horror');assert.equal(horror.titles.length,5);
assert.match(horror.headline,/5 filmes de terror famosos/);
assert.equal(new Set(horror.titles.map(t=>t.name.replace(/ LEG$/,''))).size,5);
assert(!horror.titles.some(t=>/old|future|obscure|bad|wrong-genre/.test(t.key)));
const second=editorialPlan(all,day,horror.keys,'horror');
assert(second.titles.every(t=>!horror.keys.includes(t.key)),'second daily edition cannot reuse titles');
assert(!second.headline.includes('10 '),'never claim ten titles when fewer are selected');
const noGenres=editorialPlan(all.map(t=>({...t,genres:[]})),day,[],'horror');assert.notEqual(noGenres.theme,'horror','missing genre must never be inferred from a scary title');
const series=Array.from({length:4},(_,i)=>fixture('series'+i,{kind:'series',name:`Série conhecida ${i} (2018)`,releaseYear:2018,releasedAt:Date.parse('2018-01-01'),latestSeason:4,seasonReleasedAt:Date.parse('2026-10-10')}));
const seasons=editorialPlan(series,day,[],'seasons');assert.equal(seasons.theme,'seasons');assert.match(seasons.headline,/novas temporadas/);
assert.notEqual(editorialPlan(series.map(t=>({...t,latestSeason:undefined})),day,[],'seasons').theme,'seasons','a public reference alone does not prove the season is available');
assert.notEqual(editorialPlan(series.map(t=>({...t,seasonReleasedAt:Date.parse('2027-01-01')})),day,[],'seasons').theme,'seasons');
assert.throws(()=>editorialPlan(all,day,groupCatalogVariants(all).map(t=>t.key),'horror'),/suficientes/);
assert.doesNotMatch(horror.headline,/melhores|mais comentados/i);assert.match(horror.criteria,/Não é um ranking oficial/);assert.match(horror.caption,/link da bio/);
const slides=editorialSlides(horror);assert.equal(slides.length,4);assert.equal(slides.slice(1).flatMap(s=>s.titles).length,5);
for(const format of ['feed','story'])for(const slide of slides){const svg=editorialSvg(slide,format);const metadata=await sharp(Buffer.from(svg)).metadata();assert.equal(metadata.width,1080);assert.equal(metadata.height,format==='feed'?1350:1920);assert.doesNotMatch(svg,/Comente.*teste/);}
console.log('PASS: known titles only, actual release/season evidence, year and genre checks, variant deduplication, no repeated editions, truthful counts/fallbacks, CTA, all titles in carousel, native feed/Story dimensions. No real posts.');

assert.equal(EDITORIAL_WEEK.filter(t=>t==='horror').length,1);for(const theme of ['scifi','suspense','comedy','adventure','animation'])assert(EDITORIAL_WEEK.includes(theme));assert.notEqual(editorialThemeForSlot(day,'12:00'),editorialThemeForSlot(day,'16:00'));assert.equal(editorialMainstream(fixture('small',{voteCount:1000,rating:9})),false);assert.equal(editorialMainstream(fixture('poor',{voteCount:50000,rating:6.9})),false);assert.equal(editorialMainstream(fixture('hit',{voteCount:50000,rating:8})),true);

for(const [theme,genre] of [['scifi','Fic\u00e7\u00e3o cient\u00edfica'],['suspense','Suspense'],['comedy','Com\u00e9dia'],['adventure','Aventura'],['animation','Anima\u00e7\u00e3o']]){const titles=Array.from({length:5},(_,i)=>fixture(theme+i,{genres:[genre]}));assert.equal(editorialPlan(titles,day,[],theme).theme,theme);}
