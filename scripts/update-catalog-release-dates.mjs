import fs from 'node:fs';
const file='src/lib/catalogPopularityData.ts', source=fs.readFileSync(file,'utf8');
const rows=JSON.parse(source.slice(source.indexOf('= ')+2).trim().replace(/;$/,''));
const batches=[];for(let i=0;i<rows.length;i+=100)batches.push(rows.slice(i,i+100));
async function worker(){while(batches.length){const batch=batches.shift();
 const query=`SELECT ?item (MIN(?date) AS ?release) WHERE {
 VALUES ?item { ${batch.map(e=>'wd:'+e.id).join(' ')} }
 ?item (p:P577|p:P580) ?statement. ?statement (psv:P577|psv:P580) ?value.
 ?value wikibase:timeValue ?date; wikibase:timePrecision ?precision.
 FILTER(?precision >= 11)
 } GROUP BY ?item`;
 const r=await fetch('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}),{headers:{accept:'application/sparql-results+json','user-agent':'AuxPlusCatalog/1.0 (https://auxplus.vercel.app; public metadata)'},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Wikidata HTTP '+r.status);
 for(const b of (await r.json()).results.bindings){const e=batch.find(e=>e.id===b.item.value.split('/').pop()),at=Date.parse(b.release.value);if(e&&Number.isFinite(at))e.releasedAt=at;}
 console.log('Checked',batch.length);
}}
await Promise.all([worker(),worker()]);
fs.writeFileSync(file,'// Wikidata CC0; recognition and day-precision premiere dates checked 2026-11-07.\n// Recognition proxy, not audience measurements; catalog availability is checked separately.\nexport const catalogPopularityReference = '+JSON.stringify(rows)+';\n');
console.log('Titles with precise release dates',rows.filter(r=>r.releasedAt).length);
