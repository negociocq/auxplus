import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const source=fs.readFileSync("supabase/functions/_shared/waRecovery.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},reportDiagnostics:true});
assert.equal(js.diagnostics.length,0);
const {recoveryPhone,recoveryText,recoveryPanel,recoveryCandidates,runRecoveryQueue}=await import(`data:text/javascript;base64,${Buffer.from(js.outputText).toString("base64")}`);

// Minimal in-memory PostgREST model: filters are applied at execution, including
// compare-and-set updates. All network calls below are fixtures, never real sends.
class DB {
  constructor(tables){this.tables=structuredClone(tables);}
  from(table){
    const db=this;let filters=[],order=null,limit=Infinity,offset=0,mode="select",change,single=false;
    const q={
      select(){return q;},eq(k,v){filters.push(r=>String(r[k])===String(v));return q;},
      in(k,v){filters.push(r=>v.includes(r[k]));return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},
      or(expression){const date=expression.split(".lt.")[1];filters.push(r=>r.lease_until==null||r.lease_until<date);return q;},
      order(k){order=k;return q;},limit(n){limit=n;return q;},
      range(a,b){offset=a;limit=b-a+1;return q;},
      maybeSingle(){single=true;return q;},single(){single=true;return q;},
      update(value){mode="update";change=value;return q;},
      insert(value){mode="insert";change=value;return q;},
      upsert(value){mode="upsert";change=value;return q;},
      delete(){mode="delete";return q;},
      then(resolve,reject){try{
        const table=db.tables[tableName]||=[];
        let rows=table.filter(r=>filters.every(f=>f(r)));if(order)rows.sort((a,b)=>String(a[order]).localeCompare(String(b[order])));rows=rows.slice(offset,offset+limit);
        if(mode==="update")rows.forEach(r=>Object.assign(r,change));
        if(mode==="delete")db.tables[tableName]=table.filter(r=>!rows.includes(r));
        if(mode==="insert"||mode==="upsert"){
          rows=[];for(const value of Array.isArray(change)?change:[change]){
            let existing=mode==="upsert"?table.find(r=>r.name===value.name):null;
            if(existing)Object.assign(existing,value);else{existing={id:crypto.randomUUID(),...value};table.push(existing);}rows.push(existing);
          }
        }
        return Promise.resolve(resolve({data:structuredClone(single?rows[0]||null:rows),error:null}));
      }catch(error){return reject?reject(error):Promise.reject(error);}}
    };const tableName=table;return q;
  }
}
const now=new Date().toISOString();
const fixtures=()=>({
  platform_settings:[
    {key:"automations_user_1",value:{syncFolderId:"10",iptvBearerToken:"fixture-token"}},
    {key:"iptv_panel",value:{apiProxyUrl:"https://panel.invalid"}},
    {key:"wa_bot_user_1",value:{enabled:true}},
    {key:"wa_bot_state_user_1",value:{}},
    {key:"evolution_api",value:{apiBaseUrl:"https://evolution.invalid",apiKey:"fixture",instancePrefix:"auxplus"}},
  ],
  users:[{id:"1",username:"fixture",password:"fixture-password",is_active:true}],
  folders:[{id:"10",user_id:"1",type:"Cliente"},{id:"20",user_id:"2",type:"Cliente"}],
  items:[{id:"old",folder_id:"10",item_id:"old-login",phone:"5511998765432",due_date:"2025-01-01",name:"Private nickname"}],
  wa_recovery_contacts:[],wa_recovery_campaigns:[],platform_private_secrets:[]
});
let sent=0,panelRows=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
  if(String(url)==="https://panel.invalid")return Response.json(panelRows);
  if(String(url).includes("/instance/connectionState/"))return Response.json({instance:{state:"open"}});
  if(String(url).includes("/message/sendText/")){sent++;return Response.json({key:{id:"fixture-message"}});}
  throw new Error("Unexpected network request: "+url);
};
function addCampaign(db){
  db.tables.wa_recovery_campaigns.push({id:"campaign",user_id:"1",message:"{getGreeting} {item_id} 1 teste 2 parar",status:"running",interval_seconds:120,next_at:"2020-01-01",lease_until:null});
  db.tables.wa_recovery_contacts.push({id:"contact",user_id:"1",campaign_id:"campaign",phone:recoveryPhone("5511998765432"),destination:"5511998765432",username:"old-login",item_ref:"old",status:"queued",updated_at:now});
}
try {
  assert.equal(recoveryPhone("(11) 99876-5432"),recoveryPhone("551198765432"));
  assert.equal(recoveryPhone("invalid"),"");
  assert.match(recoveryText("{getGreeting} {item_id}","old-login",new Date("2026-10-19T12:00:00Z")),/^Bom dia! old-login$/);
  let db=new DB(fixtures());
  assert.equal((await recoveryCandidates(db,"1")).length,1);
  panelRows=[{username:"old-login"}];assert.equal((await recoveryCandidates(db,"1")).length,0);
  panelRows=[];
  db.tables.items.push({id:"renewed",folder_id:"10",item_id:"new-login",phone:"551198765432",due_date:"2025-01-01"});
  panelRows=[{username:"new-login"}];assert.equal((await recoveryCandidates(db,"1")).length,0);
  panelRows=[];db=new DB(fixtures());
  db.tables.platform_settings.find(r=>r.key==="wa_bot_state_user_1").value={optOut:{"551198765432":true}};
  assert.equal((await recoveryCandidates(db,"1")).length,0);
  await assert.rejects(()=>recoveryCandidates(db,"2",{auto:{syncFolderId:"10"},usernames:new Set()}),/Pasta/);
  // A short page without metadata is not taken as evidence that later users were deleted.
  globalThis.fetch=async(url,init)=>{
    if(String(url)==="https://panel.invalid"){
      const path=init.headers["x-iptv-path"];
      return Response.json({data:path.includes("page=1&")?[{username:"first"}]:path.includes("page=2&")?[{username:"later"}]:[]});
    }throw Error("unexpected");
  };
  assert.equal((await recoveryPanel(new DB(fixtures()),"1")).usernames.has("later"),true);
  globalThis.fetch=async()=>Response.json({data:[{username:"repeated"}]});
  await assert.rejects(()=>recoveryPanel(new DB(fixtures()),"1"),/páginas/);
  globalThis.fetch=async(url,init)=>{
    if(String(url)==="https://panel.invalid")return Response.json(panelRows);
    if(String(url).includes("connectionState"))return Response.json({instance:{state:"open"}});
    if(String(url).includes("sendText")){sent++;return Response.json({key:{id:"fixture"}});}throw Error("unexpected");
  };
  db=new DB(fixtures());addCampaign(db);sent=0;
  await Promise.all([runRecoveryQueue(db,"1"),runRecoveryQueue(db,"1")]);
  assert.equal(sent,1);assert.equal(db.tables.wa_recovery_contacts[0].status,"invited");
  await runRecoveryQueue(db,"1");assert.equal(sent,1);
  db=new DB(fixtures());addCampaign(db);panelRows=[{username:"old-login"}];sent=0;
  await runRecoveryQueue(db,"1");assert.equal(sent,0);assert.equal(db.tables.wa_recovery_contacts[0].status,"skipped");
  db=new DB(fixtures());addCampaign(db);panelRows=[];db.tables.wa_recovery_campaigns[0].status="paused";
  await runRecoveryQueue(db,"1");assert.equal(sent,0);
  db=new DB(fixtures());addCampaign(db);db.tables.platform_settings.find(r=>r.key==="wa_bot_state_user_1").value={optOut:{"551198765432":true}};
  await runRecoveryQueue(db,"1");assert.equal(sent,0);assert.equal(db.tables.wa_recovery_contacts[0].status,"opted_out");
  db=new DB(fixtures());addCampaign(db);db.tables.wa_recovery_contacts[0].status="sending";
  await runRecoveryQueue(db,"1");assert.equal(sent,0);assert.equal(db.tables.wa_recovery_contacts[0].status,"uncertain");
  // The real endpoint is executed with a fixture database, including authorization.
  let handler;globalThis.Deno={env:{get:()=>"fixture"},serve:f=>{handler=f;}};
  globalThis.__recoveryDb=new DB(fixtures());globalThis.__recoveryShared={recoveryCandidates,recoverySetting:async()=>({}),runRecoveryQueue,RECOVERY_MESSAGE:"fixture"};
  let endpoint=fs.readFileSync("supabase/functions/wa-recovery/index.ts","utf8").replace(/^import .*;\r?\n/gm,"");
  endpoint="const createClient=()=>globalThis.__recoveryDb; const bcrypt={compare:async()=>false}; const {RECOVERY_MESSAGE,recoveryCandidates,recoverySetting,runRecoveryQueue}=globalThis.__recoveryShared;\n"+endpoint;
  const compiled=ts.transpileModule(endpoint,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
  const request=(body,token)=>handler(new Request("https://recovery.invalid",{method:"POST",headers:token?{Authorization:"Bearer "+token}:{},body:JSON.stringify(body)}));
  assert.equal((await request({action:"status",userId:"1"})).status,401);
  const login=await request({action:"login",username:"fixture",password:"fixture-password"});assert.equal(login.status,200);
  const {token}=await login.json();assert.equal((await request({action:"status",userId:"2"},token)).status,200);
  const session=globalThis.__recoveryDb.tables.platform_private_secrets[0];assert.equal(session.value.userId,"1");
  globalThis.__recoveryDb.tables.users[0].is_active=false;assert.equal((await request({action:"status"},token)).status,403);
  globalThis.__recoveryDb.tables.users[0].is_active=true;session.value.expiresAt="2020-01-01";assert.equal((await request({action:"status"},token)).status,401);
  const webhook=ts.createSourceFile("webhook.ts",fs.readFileSync("supabase/functions/evolution-webhook/index.ts","utf8"),ts.ScriptTarget.Latest,true);
  function findNode(predicate){let found;function visit(node){if(!found&&predicate(node))found=node;if(!found)ts.forEachChild(node,visit);}visit(webhook);assert.ok(found);return found;}
  async function compileFunction(body,names){
    const text=`export default async function(ctx){const {${names.join(",")}}=ctx;${body}}`;
    const output=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    return (await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)).default;
  }
  const creation=findNode(node=>ts.isVariableDeclaration(node)&&node.name.getText(webhook)==="createTestForSession");
  const runCreation=await compileFunction(`const createTestForSession=${creation.initializer.getText(webhook)};return createTestForSession(input);`,["input","client","userId","recoveryPanel","sessions","phone","bearer","testHours","defaultPackage","createUniplayTestUser","markTestConsumed","persistState"]);
  db=new DB(fixtures());addCampaign(db);db.tables.wa_recovery_contacts[0].status="accepted";
  let createdCount=0;const recoverySession={recoveryId:"contact",recoveryUsername:"old-login",testClientName:"Private nickname",testHours:6};
  const creationContext={input:recoverySession,client:db,userId:"1",recoveryPanel:async()=>({usernames:new Set()}),sessions:{},phone:"fixture-phone",bearer:"fixture-token",testHours:6,defaultPackage:"1",createUniplayTestUser:async(...args)=>{createdCount++;assert.equal(args[5],"old-login");return{username:"old-login",password:"fixture-new-password",remoteId:42};},markTestConsumed:()=>{},persistState:async()=>{}};
  await runCreation(creationContext);assert.equal(createdCount,1);assert.equal(db.tables.wa_recovery_contacts[0].status,"trial");
  await runCreation({...creationContext,input:creationContext.sessions["fixture-phone"]});assert.equal(createdCount,1);
  await assert.rejects(()=>runCreation(creationContext),/processamento/);assert.equal(createdCount,1);
  db.tables.wa_recovery_contacts[0].status="accepted";
  const uncertain={...creationContext,createUniplayTestUser:async()=>{createdCount++;throw Error("timeout");}};
  await assert.rejects(()=>runCreation(uncertain),/timeout/);assert.equal(db.tables.wa_recovery_contacts[0].status,"failed");
  await assert.rejects(()=>runCreation(uncertain),/processamento/);assert.equal(createdCount,2);
  const invite=findNode(node=>ts.isIfStatement(node)&&node.expression.getText(webhook)==='recoveryContact?.status === "invited"');
  const runInvite=await compileFunction(invite.thenStatement.getText(webhook),["wantsAttendant","runTestAction","session","recoveryContact","t","flowObj","testPhrase","recoveryPanel","client","userId","send","json","sessions","phone","testHours","setHumanPaused","persistState","startTestDeviceAsk"]);
  db.tables.wa_recovery_contacts[0].status="invited";let askedDevice=false;const invitationSessions={};
  await runInvite({recoveryContact:db.tables.wa_recovery_contacts[0],t:"1",flowObj:{},testPhrase:"teste",recoveryPanel:async()=>({usernames:new Set()}),client:db,userId:"1",send:async()=>{},json:v=>v,sessions:invitationSessions,phone:"fixture-phone",testHours:6,setHumanPaused:()=>{},persistState:async()=>{},startTestDeviceAsk:async()=>{askedDevice=true;}});
  assert.equal(askedDevice,true);assert.equal(db.tables.wa_recovery_contacts[0].status,"accepted");assert.equal(invitationSessions["fixture-phone"].recoveryUsername,"old-login");assert.equal(createdCount,2);
  const stop=findNode(node=>ts.isIfStatement(node)&&node.expression.getText(webhook).includes('recoveryContact?.status === "invited" && (cmdNorm === "2"'));
  const runStop=await compileFunction(stop.thenStatement.getText(webhook),["recoveryContact","client","send","json"]);
  db.tables.wa_recovery_contacts[0].status="invited";await runStop({recoveryContact:db.tables.wa_recovery_contacts[0],client:db,send:async()=>{},json:v=>v});assert.equal(db.tables.wa_recovery_contacts[0].status,"opted_out");
  const offer=findNode(node=>ts.isIfStatement(node)&&node.expression.getText(webhook).startsWith("session.recoveryId && session.testDoneAt"));
  const runOffer=await compileFunction(offer.thenStatement.getText(webhook),["wantsAttendant","runTestAction","session","sendTestOfferPlan"]);let offered=false;
  await runOffer({session:{recoveryId:"contact",testDoneAt:now},sendTestOfferPlan:async()=>{offered=true;}});assert.equal(offered,true);
  console.log("PASS recovery: expired/deleted-only candidates, all panel pages, renewed phone exclusion, account authorization, opt-out, paused queue, concurrent claims, no duplicate sends and uncertain-send quarantine. All sends mocked.");
  console.log("PASS webhook recovery: reply 1 asks device without creating early; reply 2 opts out; original username preserved; creation/replay/failure cannot issue a second trial; completed trial returns plans.");
} finally {globalThis.fetch=originalFetch;delete globalThis.Deno;delete globalThis.__recoveryDb;delete globalThis.__recoveryShared;}
