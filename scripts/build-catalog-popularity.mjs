import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('public/metadata/genre-reference-20261028.json','utf8'));
const entities=data.candidates.map(({id,kind,names,years})=>({id,kind,names,years,score:0}));
const batches=[];for(let i=0;i<entities.length;i+=250)batches.push(entities.slice(i,i+250));
let completed=0;
async function work(){while(batches.length){const batch=batches.shift();const query=`SELECT ?item ?links WHERE { VALUES ?item { ${batch.map(e=>'wd:'+e.id).join(' ')} } ?item wikibase:sitelinks ?links }`;const response=await fetch('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}),{headers:{accept:'application/sparql-results+json','user-agent':'AuxPlusCatalog/1.0 (https://auxplus.vercel.app; public metadata)'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Wikidata HTTP '+response.status);const j=await response.json();for(const r of j.results.bindings){const e=batch.find(e=>e.id===r.item.value.split('/').pop());if(e)e.score=Number(r.links.value)}console.log('Batch',++completed)}}
await Promise.all([work(),work(),work()]);
const selected=entities.filter(e=>e.score>=20);
if(selected.length<100)throw Error('Incomplete recognition reference');
fs.writeFileSync('src/lib/catalogPopularityData.ts','// Wikidata CC0. Names/year reference 2026-10-28; sitelink recognition scores checked 2026-11-07.\n// Recognition proxy, not audience or current trending measurements.\nexport const catalogPopularityReference = '+JSON.stringify(selected)+';\n');
console.log('Saved',selected.length,'recognized films and series');
