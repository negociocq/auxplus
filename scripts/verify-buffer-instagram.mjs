import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import sharp from 'sharp';
import { instagramFeedSvg, createFootballSvgCanvas } from '../supabase/functions/_shared/footballSvgCanvas.ts';
const date='2026-11-08';let fakeTime='08:00';const plannedSlots=[];
const memory={buffer_instagram_settings:[{user_id:'owner',api_key:'fixture-private-key',channel_id:'ig-1',channel_name:'Fixture',enabled:true,send_time:'07:00',feed:true,stories:true}],buffer_instagram_posts:[],instagram_editorial_plans:[],users:[{id:'owner',is_active:true}]};
class Query {
  constructor(table){this.table=table;this.filters=[];this.mode='select';}
  select(fields='*'){this.fields=fields;return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  not(k,_,v){this.filters.push(r=>r[k]!==v&&r[k]!==undefined);return this;}
  order(){return this;} limit(n){this.count=n;return this;}
  maybeSingle(){this.isSingle=true;return this;} single(){this.isSingle=true;return this;}
  update(values){this.mode='update';this.values=values;return this;}
  upsert(values,options){this.mode='upsert';this.values=values;this.options=options;return this;}
  then(resolve,reject){try{
    const list=memory[this.table]||[];
    let selected=list.filter(r=>this.filters.every(f=>f(r))).slice(0,this.count);
    if(this.mode==='update')selected.forEach(r=>Object.assign(r,this.values));
    if(this.mode==='upsert')for(const values of Array.isArray(this.values)?this.values:[this.values]){
      const cols=(this.options?.onConflict||'user_id').split(',');const current=list.find(r=>cols.every(k=>r[k]===values[k]));
      if(current){if(!this.options?.ignoreDuplicates)Object.assign(current,values);}else list.push({id:crypto.randomUUID(),status:'queued',...values});
    }
    selected=selected.map(r=>this.fields&&this.fields!=='*'?Object.fromEntries(this.fields.split(',').map(k=>[k,r[k]])):{...r});
    resolve({data:this.isSingle?selected[0]||null:selected,error:null});
  }catch(e){reject(e);}}
}
const db={from:t=>new Query(t),rpc:async(_n,{p_user,p_token})=>{const s=memory.buffer_instagram_settings.find(r=>r.user_id===p_user);s.lease_token=p_token;return {data:true,error:null};}};
let submissions=0,fail=false;
db.storage={from:()=>({download:async()=>({data:true}),getPublicUrl:file=>({data:{publicUrl:'https://fixture.invalid/'+file}})})};
const ctx={exports:{},require:path=>path.includes('src/lib/instagramEditorial')?{editorialAssetPath:(_u,plan,slot,format,index)=>'fixture/'+slot+'/'+format+'/'+index}:path.includes('instagramEditorial')?{getEditorialPlan:async(_db,_user,day,slot)=>{plannedSlots.push(slot);return {day,caption:'Selection '+slot,keys:['title-'+slot],titles:[]};},editorialSlides:plan=>[0,1].map(index=>({plan,index,total:2,titles:[]}))}:({footballClock:()=>({today:date,tomorrow:'2026-11-09',time:fakeTime}),footballManifest:r=>r.entries}),console,URLSearchParams,AbortSignal,crypto,Date,TextEncoder,Uint8Array,Deno:{env:{get:()=> 'https://fixture.invalid'}},fetch:async(url,options)=>{
  assert.equal(url,'https://api.buffer.com');
  const {query}=JSON.parse(options.body);
  if(query.includes('createPost')){submissions++;if(fail)throw Error('network after submit');return {ok:true,json:async()=>({data:{createPost:{post:{id:'buffer-fixture'}}}})};}
  if(query.includes('organizations'))return {ok:true,json:async()=>({data:{account:{organizations:[{id:'org'}]}}})};
  return {ok:true,json:async()=>({data:{channels:[{id:'ig-1',service:'instagram',displayName:'Fixture'},{id:'other',service:'facebook'}]}})};
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/bufferInstagram.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
const api=ctx.exports;
const entries=Array.from({length:23},(_,page)=>({day:date,region:'national',page,total:23}));
const jobs=api.instagramJobs(entries,true,true);
assert.equal(jobs.filter(j=>j.kind==='feed').length,3);assert.equal(jobs.filter(j=>j.kind==='story').length,23);
assert.deepEqual(Array.from(jobs.filter(j=>j.kind==='feed').flatMap(j=>j.entries.map(e=>e.page))),entries.map(e=>e.page));
assert.equal(api.instagramJobs(entries,false,true).some(j=>j.kind==='feed'),false);
assert.equal(api.instagramJobs(entries,true,false).some(j=>j.kind==='story'),false);
const job={id:'job',user_id:'owner',channel_id:'ig-1',post_day:date,kind:'feed',batch:0,status:'queued',entries:[],assets:['https://fixture.invalid/banner.png']};
const input=api.instagramPostInput(job,job.assets);assert.equal(input.mode,'shareNow');assert.equal(input.metadata.instagram.type,'post');
assert.equal(api.instagramPostInput({...job,kind:'story'},job.assets).metadata.instagram.type,'story');
assert.throws(()=>api.instagramPostInput(job,['http://unsafe.test/image']),/inválidas/);
const state=await api.manageBufferInstagram(db,'owner',{action:'channels'});
assert.equal(state.channels.length,1);assert(!JSON.stringify(state).includes('fixture-private-key'));
await assert.rejects(api.manageBufferInstagram(db,'owner',{action:'save',enabled:true,feed:true,stories:true,sendTime:'07:00',channelId:'other'}),/Escolha/);
memory.buffer_instagram_posts=[{...job}];
await api.runBufferInstagram(db,'owner');assert.equal(submissions,1);assert.equal(memory.buffer_instagram_posts[0].status,'accepted');
await api.runBufferInstagram(db,'owner');assert.equal(submissions,1,'accepted posts cannot be sent twice');
memory.buffer_instagram_posts=[{...job}];fail=true;
await api.runBufferInstagram(db,'owner');assert.equal(memory.buffer_instagram_posts[0].status,'uncertain');
await api.runBufferInstagram(db,'owner');assert.equal(submissions,2,'unknown submission outcome must not retry');
memory.buffer_instagram_posts=[{...job,post_day:'2026-11-07'},{...job,id:'today',status:'accepted'}];
await api.runBufferInstagram(db,'owner');assert.equal(submissions,2,'past dates never publish');

fail=false;const setting=memory.buffer_instagram_settings[0];setting.editorial_enabled=true;setting.editorial_times=['12:00','16:00'];
memory.buffer_instagram_posts=[{...job,status:'accepted'}];
const beforeEditions=submissions;
fakeTime='11:59';await api.runBufferInstagram(db,'owner');assert.equal(submissions,beforeEditions);assert.equal(plannedSlots.length,0);
fakeTime='12:00';await api.runBufferInstagram(db,'owner');assert.deepEqual(plannedSlots,['12:00']);assert.equal(submissions,beforeEditions+3);
await api.runBufferInstagram(db,'owner');assert.equal(submissions,beforeEditions+3);
fakeTime='15:59';await api.runBufferInstagram(db,'owner');assert.deepEqual(plannedSlots,['12:00']);
fakeTime='16:00';await api.runBufferInstagram(db,'owner');assert.deepEqual(plannedSlots,['12:00','16:00']);assert.equal(submissions,beforeEditions+6);
await api.runBufferInstagram(db,'owner');assert.equal(submissions,beforeEditions+6);
const editorialJobs=memory.buffer_instagram_posts.filter(p=>p.topic==='editorial');assert.equal(editorialJobs.length,6);
assert.equal(new Set(editorialJobs.map(p=>p.edition)).size,2);assert.equal(setting.send_time,'07:00');
assert.equal(api.instagramPostInput(editorialJobs[0],['https://fixture.invalid/image']).text,'Selection 12:00');
const original=createFootballSvgCanvas().svg();const fitted=instagramFeedSvg(original);const metadata=await sharp(Buffer.from(fitted)).metadata();
assert.equal(metadata.width,1080);assert.equal(metadata.height,1350);assert.match(fitted,/viewBox="0 0 1080 1920"/);
for(const file of ['supabase/functions/buffer-instagram/index.ts','src/components/InstagramBannerAutomation.tsx']){
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});assert.equal(result.diagnostics.length,0);
}
console.log('PASS: Instagram-only discovery, private key redaction, account validation, all pages preserved, feed/story formats, durable acceptance, no retry after unknown response, no old-day publishing, 4:5 renderer. No real posts.');
