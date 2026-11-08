import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

let handler, now=120000, slow=false, active=false;
const calls=[];
class Clock extends Date { static now(){return now;} }
async function queue(name){assert.equal(active,false,'workers must not race the same delivery lock');active=true;calls.push(name);if(slow)now+=50000;await Promise.resolve();active=false;}
const query={select(){return query},eq(){return query},async maybeSingle(){return {data:{value:{token:'fixture'}}}}};
const code=ts.transpileModule(fs.readFileSync('supabase/functions/wa-content-status/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:{},Date:Clock,Request,Response,URL,console,crypto:globalThis.crypto,
 Deno:{env:{get:()=> 'fixture'},serve:fn=>{handler=fn}},
 require:name=>name.includes('supabase-js')?{createClient:()=>({from:()=>query})}:name.includes('contentStatus')?{runContentStatusQueue:()=>queue('content')}:name.includes('footballStatus')?{runFootballStatusQueue:()=>queue('football')}:{renderContentBanner:async()=>new Uint8Array()},
});
async function tick(){return handler(new Request('https://fixture.invalid',{method:'POST',headers:{'x-content-cron':'fixture'},body:JSON.stringify({action:'tick'})}));}
assert.equal((await tick()).status,200);assert.deepEqual(calls,['football']);
calls.length=0;now=180000;await tick();assert.deepEqual(calls,['football'],'existing minute schedule still runs football');
const before=calls.length;
for(const action of ['content-status-post-now','content-status-save','content-status-preview']){
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({action,enabled:true})}));
 assert.equal(response.status,410,'old clients cannot reactivate or generate retired movie banners');
}
assert.equal(calls.length,before,'retired actions never dispatch any queue');
const unauthorized=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({action:'tick'})}));
assert.equal(unauthorized.status,401);
assert.equal(calls.length,before,'cron remains authenticated');
console.log('PASS: movie/series actions retired, existing cron runs football only, unauthenticated ticks blocked.');
