import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {upgradePartnerTestFlow,zuxoRemoteInstructions,zuxoSamsungInstructions,zuxoActivatedInstructions} from '../supabase/functions/_shared/partnerTestFlow.ts';
const saved={appCatalogVersion:8,pcLoginUrl:'https://fixture.invalid/login',deviceMenu:{options:[{key:'3',action:'pc'}]},texts:{pcReady:'PC {loginUrl} {user}'}};
const fixed=upgradePartnerTestFlow(saved);assert.equal(fixed.appCatalogVersion,13);assert.equal(fixed.pcLoginUrl,saved.pcLoginUrl);assert.deepEqual(upgradePartnerTestFlow(fixed),fixed);
const source = ts.createSourceFile('webhook.ts', fs.readFileSync('supabase/functions/evolution-webhook/index.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function initializer(name) {
  let found;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer.getText(source); ts.forEachChild(node, visit); };
  visit(source); assert(found, name + ' missing'); return found;
}

const routes=vm.createContext({finishTestPcPhone:async(s,kind)=>({kind,s}),finishTestWithApp:async(s,app)=>({app,s})});
vm.runInContext(ts.transpile('var finishZuxoDevice = '+initializer('finishZuxoDevice')+';var runAction = '+initializer('runTestAction')),routes);
for(const os of ['android','ios']) {
 const r=await routes.runAction({testTv:'samsung'},'phone_'+os);
 assert.equal(r.app,'zuxo');assert.equal(r.s.testDevice,'phone');assert.equal(r.s.testPhoneOs,os);assert.equal(r.s.testTv,undefined);
 assert.match(zuxoRemoteInstructions(os),/MAC/);assert.match(zuxoRemoteInstructions(os),os==='ios'?/engrenagem.*Configura/:/tela inicial/);assert.match(zuxoRemoteInstructions(os),os==='ios'?/print/:/foto/);
}
for(const brand of ['lg','roku','android']) for(const action of ['app_zuxo','app_pixel','app_utm']) {
 const r=await routes.runAction({testTv:brand},action);assert.equal(r.app,'zuxo');assert.equal(r.s.testDevice,'tv');
}
assert.equal((await routes.runAction({testTv:'samsung'},'app_zuxo')).kind,'samsung');assert.equal((await routes.runAction({},'pc')).kind,'pc');
let created=0,logged=0;const sent=[]; const attachments=[];
const env=vm.createContext({bearer:'',client:{},userId:'fixture',automations:{},phone:'fixture',sessions:{},testHours:2,
 json:v=>v,ensurePanelBearer:async()=> 'fixture',createUniplayTestUser:async()=>{created++;throw Error('duplicate trial');},
 markTestConsumed:()=>{logged++;},logWhatsAppTest:async()=>{logged++;},persistState:async()=>{},flowObj:saved,tfTexts:saved.texts,zuxoSamsungInstructions,partnerGuideUrl:()=>"https://fixture.invalid/samsung.png",Deno:{env:{get:()=>"https://fixture.invalid"}},
 fillTestReady:(text,values)=>text.replace(/\{(\w+)\}/g,(_,k)=>values[k]||''),send:async (text,image)=>{sent.push(text);attachments.push(image);}});
vm.runInContext(ts.transpile('var createTestForSession = '+initializer('createTestForSession')+';var finishDevice = '+initializer('finishTestPcPhone')),env);
const recovery={testClientName:'Fixture',testUsername:'existing-user',testPassword:'fixture-password'};
await env.finishDevice(recovery,'samsung');assert.equal(env.sessions.fixture.testActivationMode,'manual_samsung');assert.equal(env.sessions.fixture.state,'test_confirm_install');
assert.match(attachments[0],/samsung.png/);assert.match(sent[0],/jung777/);assert.match(sent[0],/existing-user/);assert.match(sent[0],/fixture-password/);assert.doesNotMatch(sent[0],/MAC/);
sent.length=0;await env.finishDevice(recovery,'pc');assert.match(sent[0],/fixture.invalid/);assert.equal(created,0);assert.equal(logged,0);
console.log('PASS: universal Zuxo routes, Samsung manual credentials, remote phone/TV MAC, existing credentials reused, PC preserved; no real sends');

for(const device of ['phone','tv']) {assert.match(zuxoActivatedInstructions(device),/Aguarde alguns segundos.*aplicativo aberto/);assert.doesNotMatch(zuxoActivatedInstructions(device),/feche|Reload|controle/i);}
