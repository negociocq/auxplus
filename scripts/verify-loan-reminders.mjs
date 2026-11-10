import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64')}`;
const loansUrl=moduleUrl(fs.readFileSync('supabase/functions/_shared/loans.ts','utf8'));
const queueUrl=moduleUrl(fs.readFileSync('supabase/functions/_shared/loanReminderQueue.ts','utf8').replace('"./loans.ts"',JSON.stringify(loansUrl)));
const {writeLoanAutoSettings,writeLoanReminder,writeLoanPixKey,writeLoan,recordLoanPayment}=await import(loansUrl);
const {loanReminderCandidate}=await import(queueUrl);
const folder={id:'1',user_id:'1',type:'Produto',whatsapp_message:writeLoanAutoSettings(writeLoanPixKey(writeLoanReminder('', 'Olá {name}, total {total}, vence {due_date}'), 'pix-fixture'),{enabled:true,sendTime:'09:30'})};
const terms={version:1,principal:200,agreedAmount:500,lentAt:'2026-11-01',dueDate:'2026-11-13',lateRate:3,latePeriod:'month'};
const item={id:'2',folder_id:'1',name:'Cliente exemplo',phone:'71999999999',is_active:false,notes:writeLoan('',terms)};
const candidate=loanReminderCandidate(folder,item,'2026-11-11','09:30');
assert.equal(candidate.kind,'before');assert.equal(candidate.phone,'5571999999999');assert.ok(candidate.text.includes('pix-fixture'));assert.ok(candidate.text.includes('500,00'));
assert.equal(loanReminderCandidate(folder,item,'2026-11-11','09:29'),null);
assert.equal(loanReminderCandidate(folder,item,'2026-11-12','10:00'),null);
assert.equal(loanReminderCandidate(folder,item,'2026-11-14','10:00'),null);
assert.equal(loanReminderCandidate({...folder,type:'Cliente'},item,'2026-11-11','10:00'),null);
assert.equal(loanReminderCandidate({...folder,whatsapp_message:''},item,'2026-11-11','10:00'),null);
assert.equal(loanReminderCandidate(folder,{...item,notes:writeLoan('',{...terms,paidAt:'2026-11-11T10:00:00Z',paidAmount:500})},'2026-11-11','10:00'),null);
const beforeOnly={...folder,whatsapp_message:writeLoanAutoSettings(folder.whatsapp_message,{enabled:true,sendBefore:true,sendOnDay:false,sendTime:'09:30'})};
assert.ok(loanReminderCandidate(beforeOnly,item,'2026-11-11','10:00'));
assert.equal(loanReminderCandidate(beforeOnly,item,'2026-11-13','10:00'),null);
const onDayOnly={...folder,whatsapp_message:writeLoanAutoSettings(folder.whatsapp_message,{enabled:true,sendBefore:false,sendOnDay:true,sendTime:'09:30'})};
assert.equal(loanReminderCandidate(onDayOnly,item,'2026-11-11','10:00'),null);
assert.ok(loanReminderCandidate(onDayOnly,item,'2026-11-13','10:00'));
const neither={...folder,whatsapp_message:writeLoanAutoSettings(folder.whatsapp_message,{enabled:false,sendBefore:false,sendOnDay:false,sendTime:'09:30'})};
assert.equal(loanReminderCandidate(neither,item,'2026-11-11','10:00'),null);
assert.equal(loanReminderCandidate(neither,item,'2026-11-13','10:00'),null);
const renewedTerms=recordLoanPayment(terms,{id:'interest-fixture',kind:'interest',paidAt:'2026-11-13T15:00:00Z',nextDueDate:'2026-12-13'});
const renewedItem={...item,notes:writeLoan('',renewedTerms)};
assert.equal(loanReminderCandidate(folder,renewedItem,'2026-11-13','10:00'),null,'old due-day reminders stop after interest rollover');
assert.equal(loanReminderCandidate(folder,renewedItem,'2026-12-11','10:00').kind,'before');
assert.equal(loanReminderCandidate(folder,renewedItem,'2026-12-13','10:00').kind,'onday');
folder.whatsapp_message=writeLoanReminder(writeLoanReminder(folder.whatsapp_message,'ANTES {name}: {total}','before'),'HOJE {name}: {total}','onday');
assert.ok(loanReminderCandidate(folder,item,'2026-11-11','10:00').text.startsWith('ANTES'));
assert.ok(loanReminderCandidate(folder,item,'2026-11-13','10:00').text.startsWith('HOJE'));

// Exercise the real server handler with an atomic in-memory settings store and mocked Evolution.
const records=new Map([['evolution_api',{key:'evolution_api',value:{apiBaseUrl:'https://fixture.invalid',apiKey:'fixture',instancePrefix:'auxplus'}}]]);
let sends=0,handler;const sentTexts=[];
class Query {
 constructor(table){this.table=table;this.filters=[];this.action='select';}
 select(){return this;}eq(k,v){this.filters.push(r=>String(r[k])===String(v));return this;}
 in(k,vs){this.filters.push(r=>vs.map(String).includes(String(r[k])));return this;}
 like(k,v){const prefix=v.slice(0,-1).replaceAll('\\_', '_');this.filters.push(r=>String(r[k]).startsWith(prefix));return this;}
 gte(k,v){this.filters.push(r=>r[k]>=v);return this;}maybeSingle(){this.single=true;return this;}
 insert(row){this.action='insert';this.row=row;return this;}update(row){this.action='update';this.row=row;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{
  if(this.action==='insert'){if(records.has(this.row.key))return {data:null,error:{code:'23505'}};records.set(this.row.key,this.row);return {data:null,error:null};}
  const rows=this.table==='folders'?[folder]:this.table==='users'?[{id:'1',username:'fixture',is_active:true}]:this.table==='items'?[item]:[...records.values()];
  const selected=rows.filter(r=>this.filters.every(fn=>fn(r)));
  if(this.action==='update'){for(const r of selected)Object.assign(r,this.row);return {data:null,error:null};}
  return {data:this.single?selected[0]||null:selected,error:null};
 }).then(resolve,reject);}
}
const RealDate=Date,realFetch=globalThis.fetch,realDeno=globalThis.Deno,realTimer=globalThis.setTimeout;
let clock='2026-11-11T13:00:00Z';
globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return RealDate.parse(clock);}};
globalThis.__loanClientFactory=()=>({from:table=>new Query(table)});
globalThis.Deno={env:{get:key=>({AUXPLUS_LOAN_CRON_SECRET:'secret',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'})[key]},serve:fn=>{handler=fn;}};
globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};
globalThis.fetch=async (url,init)=>{if(url.includes('connectionState'))return Response.json({instance:{state:'open'}});sends++;sentTexts.push(JSON.parse(init.body).text);return Response.json({key:{id:'fixture'}});};
try{
 let source=fs.readFileSync('supabase/functions/loan-reminders/index.ts','utf8').replace(/import \{ createClient \} from "[^"]+";/,'const createClient = globalThis.__loanClientFactory;').replace('"../_shared/loanReminderQueue.ts"',JSON.stringify(queueUrl));
 await import(moduleUrl(source));
 const request=(body={})=>new Request('https://fixture.invalid',{method:'POST',headers:{'x-loan-cron':'secret','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handler(new Request('https://fixture.invalid',{method:'POST'}))).status,401);
 const dry=await (await handler(request({dryRun:true}))).json();assert.equal(dry.eligible,1);assert.equal(sends,0);
 const results=await Promise.all([handler(request()),handler(request())]);
 for(const r of results)assert.equal(r.status,200);
 assert.equal(sends,1,'concurrent runs may send only once');
 await handler(request());assert.equal(sends,1,'subsequent runs must not replay');
 clock='2026-11-13T13:00:00Z';await handler(request());assert.equal(sends,2,'due-day has its own single delivery');
 assert.ok(sentTexts[0].startsWith('ANTES'));assert.ok(sentTexts[1].startsWith('HOJE'));
 item.notes=writeLoan('',{...terms,paidAt:'2026-11-13T12:00:00Z',paidAmount:500});
 await handler(request());assert.equal(sends,2,'paid loans do not send');
 item.id='3';item.notes=writeLoan('',terms);
 globalThis.fetch=async url=>{if(url.includes('connectionState'))return Response.json({instance:{state:'open'}});sends++;throw Error('fixture uncertain delivery');};
 await handler(request());assert.equal(sends,3);
 assert.equal(records.get('loan_reminder_1_3_2026-11-13_onday').value.status,'delivery_unknown');
 await handler(request());assert.equal(sends,3,'uncertain delivery cannot be replayed');
 console.log('PASS: schedule boundaries, custom message and PIX, inactive loan rows, paid/excluded accounts, authenticated handler, dry-run, concurrent claim, duplicate suppression, separate due-day and paid stop. No real sends.');
} finally {globalThis.Date=RealDate;globalThis.fetch=realFetch;globalThis.Deno=realDeno;globalThis.setTimeout=realTimer;delete globalThis.__loanClientFactory;}
