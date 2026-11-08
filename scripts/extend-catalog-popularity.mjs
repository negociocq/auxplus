import fs from 'node:fs';
const file = 'src/lib/catalogPopularityData.ts';
const source = fs.readFileSync(file, 'utf8');
const existing = JSON.parse(source.slice(source.indexOf('= ') + 2).trim().replace(/;$/, ''));
const entities = new Map(existing.map(e => [e.id, e]));
const jobs = [2008,2010,2011,2013,2016,2019,2020,2021,2022,2023,2024,2025].map(year => ({kind:'series',year}));
jobs.push(...[2022,2023,2024,2025].map(year=>({kind:'movie',year})));
async function worker() {
  while (jobs.length) {
    const {kind,year} = jobs.shift(), dateProperty = kind === 'series' ? 'P580' : 'P577', root = kind === 'series' ? 'Q5398426' : 'Q11424';
    const query = `SELECT ?item ?score ?label ?date WHERE {
      ?item wdt:${dateProperty} ?date. hint:Prior hint:rangeSafe true.
      FILTER(?date >= "${year}-01-01T00:00:00Z"^^xsd:dateTime && ?date < "${year+1}-01-01T00:00:00Z"^^xsd:dateTime)
      ?item wdt:P31 wd:${root}; wikibase:sitelinks ?score; (rdfs:label|skos:altLabel) ?label.
      FILTER(?score >= 20 && LANG(?label) IN ("pt","pt-br","en","mul"))
    }`;
    const r=await fetch('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}),{headers:{accept:'application/sparql-results+json','user-agent':'AuxPlusCatalog/1.0 (https://auxplus.vercel.app; public metadata)'},signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw Error(`Wikidata HTTP ${r.status}`);
    for(const row of (await r.json()).results.bindings){
      const id=row.item.value.split('/').pop(), e=entities.get(id)||{id,kind,names:[],years:[],score:Number(row.score.value)};
      e.names.push(row.label.value);e.years.push(Number(row.date.value.slice(0,4)));entities.set(id,e);
    }
    console.log(kind,year);
  }
}
await Promise.all([worker(),worker()]);
const rows=[...entities.values()].map(e=>({...e,names:[...new Set(e.names)],years:[...new Set(e.years)]}));
fs.writeFileSync(file,'// Wikidata CC0; recognition via Wikimedia sitelink counts checked 2026-11-07.\n// A recognition proxy, not audience or current trending measurements.\nexport const catalogPopularityReference = '+JSON.stringify(rows)+';\n');
console.log('Reference size',rows.length);
