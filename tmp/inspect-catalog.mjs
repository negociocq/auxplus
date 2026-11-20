import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const source=fs.readFileSync('scripts/check-config.mjs','utf8');
const url=source.match(/const SUPABASE_URL = "([^"]+)"/)[1];const key=source.match(/const SUPABASE_ANON_KEY =\s*"([^"]+)"/)[1];
const db=createClient(url,key);const {data,error}=await db.from('platform_settings').select('key,value').in('key',['automations_user_1','iptv_panel']);if(error)throw Error(error.message);
const parsed=Object.fromEntries(data.map(r=>[r.key,typeof r.value==='string'?JSON.parse(r.value):r.value]));
const c=parsed.automations_user_1,p=parsed.iptv_panel; if(!c)throw Error('No config');
const base=(p?.apiProxyUrl||'https://auxplus.vercel.app/api/gesapi').replace(/\/$/,'');const path='/get-available-movies?reg_password='+encodeURIComponent(c.iptvRegPassword||p?.regPassword||'');
const endpoint=base.includes('/api/gesapi')||base.includes('/functions/v1/')?base:base+path;
const r=await fetch(endpoint,{headers:{'x-iptv-path':path,'x-iptv-authorization':'Bearer '+c.iptvBearerToken,accept:'application/json'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Catalog HTTP '+r.status);const catalog=await r.json();
fs.writeFileSync('tmp/catalog-diagnostic.json',JSON.stringify(catalog));
for(const kind of ['movies','series']){const rows=catalog[kind]||[];const keys=[...new Set(rows.slice(0,100).flatMap(Object.keys))];console.log(JSON.stringify({kind,total:rows.length,keys,first:rows.slice(0,3).map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>/id$|name|title|date|added|creat|modif|time/i.test(k))))}));}
