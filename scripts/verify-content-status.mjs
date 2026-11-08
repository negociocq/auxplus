import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
import { mockStatusDb } from "./lib/mock-status-db.mjs";
import * as discover from "../src/lib/uniplayDiscover.ts";
import * as banners from "../src/lib/catalogBanner.ts";
import * as popularity from "../src/lib/catalogPopularity.ts";
import { statusQueueSummary } from "../src/lib/statusQueue.ts";
const settings = { evolution_api: { apiBaseUrl: "https://evolution.example", apiKey: "fixture", instancePrefix: "auxplus" },
  iptv_panel: { apiProxyUrl: "https://panel.example" }, automations_user_user1: { iptvBearerToken: "fixture-token" } };
const recovery = { recoverySetting: async (_, key) => settings[key] || {} };
function load(file, require) { const exports = {}; const code = ts.transpileModule(fs.readFileSync(file,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("require","exports",code)(require,exports); return exports; }
const football = load("supabase/functions/_shared/footballStatus.ts", () => recovery);
const api = load("supabase/functions/_shared/contentStatus.ts", name => name.includes("footballStatus") ? football : name.includes("waRecovery") ? recovery : name.includes("catalogBanner") ? banners : name.includes("catalogPopularity") ? popularity : discover);
const clock = football.footballClock();
const database = (enabled = true) => mockStatusDb({ wa_content_status_settings: [{ user_id: "user1", enabled, send_time: "00:00", pages_per_kind: 1 }],
  wa_content_status_posts: [], users: [{ id: "user1", username: "owner", is_active: true }] });
const recentRelease=new Date(Date.now()-7*86400000).toISOString();
const raw = { movies: [...Array.from({length:9},(_,i)=>({name:`Filme ${i} (${clock.today.slice(0,4)})`,release_date:recentRelease,vote_count:1000,thumb:"https://image.tmdb.org/t/p/w500/test.jpg"})),{name:`Filme 0 (${clock.today.slice(0,4)}) LEG`},{name:"Antigo (2013)"}],
  series: Array.from({length:5},(_,i)=>({name:`Série ${i} (${clock.today.slice(0,4)})`,release_date:recentRelease,vote_count:1000,thumb:"https://image.tmdb.org/t/p/w500/test.jpg"})) };
const pages = banners.catalogBannerPages(discover.normalizeCatalog(raw), 1);
assert.equal(pages.length, 2); assert.ok(pages.every(p=>p.titles.length===4));
assert.equal(pages[0].kind,"movie"); assert.equal(pages[1].kind,"series");
assert.equal(pages[0].titles[0].audioLabel,"DUB/LEG");
assert.equal(banners.catalogBannerPages(discover.normalizeCatalog(raw),1,pages[0].titles.map(t=>t.key))[0].titles.some(t=>t.key===pages[0].titles[0].key),false);
const svg=banners.catalogBannerSvg({...pages[0],titles:[{...pages[0].titles[0],name:'<script>alert("bad")</script>'}]});
assert.ok(!svg.includes('<script>')); assert.ok(svg.includes('&lt;script&gt;')); assert.ok(svg.includes('Comente “teste”'));
let sends=0, calls=0, failSend=false, failRender=false;
const png=Uint8Array.from([137,80,78,71,13,10,26,10]);
const render=async()=>{if(failRender)throw Error("Render unavailable");return png;};
const original=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
  calls++;
  if(url.includes("panel.example"))return {ok:true,status:200,json:async()=>raw};
  if(url.includes("connectionState"))return {ok:true,json:async()=>({instance:{state:"open"}})};
  if(url.includes("fetchInstances"))return {ok:true,json:async()=>[{name:"auxplus-owneruser1",ownerJid:"5511999999999@s.whatsapp.net"}]};
  if(url.includes("findContacts"))return {ok:true,json:async()=>[{remoteJid:"5511888888888@s.whatsapp.net",pushName:"Fixture"}]};
  if(url.includes("findMessages"))return {ok:true,json:async()=>({messages:{records:[]}})};
  if(url.includes("message/sendStatus")){sends++;const body=JSON.parse(init.body);assert.equal(body.type,"image");assert.equal(body.caption,football.FOOTBALL_STATUS_CAPTION);assert.equal(body.allContacts,false);assert.ok(body.statusJidList.length);if(failSend)throw Error("Reply lost");return {ok:true,json:async()=>({key:{remoteJid:"status@broadcast",id:`message-${sends}`},status:"SERVER_ACK"})};}
  throw Error(`Unexpected network call: ${url}`);
};
try{
  const off=database(false);await api.manageContentStatus(off,"user1",{action:"content-status-state"});await api.runContentStatusQueue(off,render);assert.equal(calls,0,"viewing a queue and a disabled automatic switch never send");
  off.tables.wa_content_status_settings[0].send_time="23:59";
  await api.manageContentStatus(off,"user1",{action:"content-status-post-now"});assert.equal(sends,0,"request is queued; management does not send inline");
  assert.equal(off.tables.wa_content_status_settings[0].enabled,false);assert.equal(off.tables.wa_content_status_settings[0].send_time,"23:59");
  await api.runContentStatusQueue(off,render,"other-user");assert.equal(sends,0);
  await api.runContentStatusQueue(off,render,"user1");assert.equal(sends,1);assert.equal(off.tables.wa_content_status_posts.length,2);
  await api.runContentStatusQueue(off,render,"user1");assert.equal(sends,2);assert.equal(statusQueueSummary(off.tables.wa_content_status_posts,clock.today).label,"Concluído");
  await api.manageContentStatus(off,"user1",{action:"content-status-post-now"});await api.runContentStatusQueue(off,render,"user1");assert.equal(sends,2,"confirmed pages are never repeated");
  const broken=database();failRender=true;await api.runContentStatusQueue(broken,render);assert.equal(sends,2);assert.ok(broken.tables.wa_content_status_settings[0].last_error);assert.ok(broken.tables.wa_content_status_posts.every(p=>p.status==="queued"));
  failRender=false;await api.manageContentStatus(broken,"user1",{action:"content-status-post-now"});await api.runContentStatusQueue(broken,render);assert.equal(sends,3,"render failures are safe to resume");
  const uncertain=database();failSend=true;await api.runContentStatusQueue(uncertain,render);assert.equal(uncertain.tables.wa_content_status_posts[0].status,"uncertain");
  failSend=false;await api.runContentStatusQueue(uncertain,render);const attempts=sends;await api.manageContentStatus(uncertain,"user1",{action:"content-status-post-now"});await api.runContentStatusQueue(uncertain,render);assert.equal(sends,attempts,"uncertain pages must not be retried");
  assert.equal(statusQueueSummary(uncertain.tables.wa_content_status_posts,clock.today).label,"Aguardando confirmação");
  const historical=database();
  historical.tables.wa_content_status_posts.push({id:'old-missing',user_id:'user1',post_day:'2026-10-01',kind:'movie',page:0,total:1,status:'uncertain',media_sha256:'a'.repeat(64),attempted_at:new Date(Date.now()-86400000).toISOString(),payload:{titles:[]}});
  const nativeFrom=historical.from.bind(historical);
  historical.from=name=>{const query=nativeFrom(name),update=query.update;query.update=values=>{if(name==='wa_content_status_posts'&&'recovery_attempts' in values)throw Error('column recovery_attempts does not exist');return update(values)};return query;};
  const beforeHistorical=sends;
  await api.runContentStatusQueue(historical,render);
  assert.equal(sends,beforeHistorical+1,'an uncertain historical movie must not block today or use football-only columns');
  assert.equal(historical.tables.wa_content_status_settings[0].last_error,null);
  assert.equal(historical.tables.wa_content_status_posts[0].status,'uncertain','do not resend old uncertain movies');
  const blocked=database();blocked.tables.wa_status_delivery_locks=[{user_id:"user1",token:"games",expires_at:new Date(Date.now()+60000).toISOString()}];const prior=calls;await api.runContentStatusQueue(blocked,render);assert.equal(calls,prior,"games and catalog never claim the same WhatsApp delivery concurrently");
}finally{globalThis.fetch=original;}
console.log("PASS: real catalog plan, four unique titles, movie/series separation, manual schedule preservation, durable queue, safe retries, no duplicate or direct messages, truthful completion and shared delivery lock (all network calls mocked)");

const recognized=discover.normalizeCatalog({movies:[{name:'Duna (2021)'},{name:`Filme irrelevante (${clock.today.slice(0,4)})`},{name:'Duna (2021) LEG'}],series:[]});
const highlights=banners.catalogBannerPages(recognized,1);
assert.equal(highlights.length,0,'old famous movies and unknown new movies cannot fill a release banner');
assert.match(banners.catalogBannerSvg(pages[0]),/LANÇAMENTOS/);
const season_release_date=new Date(Date.now()-14*86400000).toISOString();
const seriesAliases=discover.normalizeCatalog({movies:[],series:[{name:'Game of Thrones',season_release_date},{name:'Game of Thrones (2011)',season_release_date},{name:'Breaking Bad (2008)'}]});
assert.equal(banners.catalogBannerPages(seriesAliases,1)[0].titles.length,1,'confirmed recent seasons qualify once; an old series with no new season is excluded');
const recent=discover.normalizeCatalog({movies:[
 {name:'Popular novo',vote_count:15000,rating:8,release_date:new Date(Date.now()-10*86400000).toISOString()},
 {name:'Popular antigo',vote_count:1000000,rating:9,release_date:'2021-01-01'},
 {name:'Novo mal avaliado',vote_count:20000,rating:3,release_date:new Date(Date.now()-5*86400000).toISOString()},
 {name:'Novo desconhecido',release_date:new Date(Date.now()-5*86400000).toISOString()},
 {name:'Estreia futura',vote_count:15000,rating:8,release_date:new Date(Date.now()+86400000).toISOString()},
],series:[]});
assert.deepEqual(banners.catalogBannerPages(recent,1)[0].titles.map(t=>t.name),[`Popular novo (${clock.today.slice(0,4)})`]);
assert.equal(banners.catalogBannerPages(discover.normalizeCatalog({movies:[],series:[{name:'Scrubs (2026)'}]}),1).length,0,'a catalog year must not reclassify the original 2001 series as a new premiere');
console.log('PASS: recent recognized releases only, poor ratings and future releases excluded, confirmed new seasons and alias deduplication.');
