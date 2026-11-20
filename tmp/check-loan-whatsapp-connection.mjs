import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import {loanInstanceName,isLoanWhatsappInstance} from '../supabase/functions/_shared/waLoanConnection.ts';
const instance=loanInstanceName('auxplus','fixture','loan-fixture');
assert.ok(isLoanWhatsappInstance(instance));assert.notEqual(instance,loanInstanceName('auxplus','fixture','other-folder'));assert.notEqual(instance,loanInstanceName('auxplus','another-user','loan-fixture'));
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:393,height:900}});let created=false,open=false;const requests=[],sends=[];
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin==='http://127.0.0.1:5197')return route.continue();
  const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers,body:''});
  if(url.pathname==='/rest/v1/platform_settings'){
   assert.equal(req.method(),'GET','loan connection must not register IPTV mapping or overwrite config');
   return route.fulfill({status:200,headers,body:JSON.stringify([{value:{apiBaseUrl:'https://evolution-fixture.invalid',apiKey:'fixture',instancePrefix:'auxplus'}}])});
  }
  if(url.origin==='https://evolution-fixture.invalid'){
   requests.push({path:url.pathname,method:req.method()});
   if(url.pathname==='/instance/create'){assert.equal(req.postDataJSON().instanceName,instance);created=true;return route.fulfill({status:201,headers,body:'{}'});}
   if(url.pathname.includes('connectionState'))return route.fulfill({status:created?200:404,headers,body:JSON.stringify({instance:{state:open?'open':'close'}})});
   if(url.pathname===`/instance/connect/${instance}`)return route.fulfill({status:200,headers,body:JSON.stringify({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOgAAAABJRU5ErkJggg=='})});
   if(url.pathname==='/instance/fetchInstances')return route.fulfill({status:200,headers,body:JSON.stringify([{instance:{instanceName:'auxplus-fixturefixture',ownerJid:'5571999990002@s.whatsapp.net',profileName:'IPTV'}},{instance:{instanceName:instance,ownerJid:'5571999990001@s.whatsapp.net',profileName:'Empréstimos fixture'}}])});
   if(url.pathname===`/message/sendText/${instance}`){sends.push(req.postDataJSON());return route.fulfill({status:200,headers,body:'{"key":{"id":"fixture"}}'});}
   if(url.pathname===`/instance/logout/${instance}`){assert.equal(req.method(),'DELETE');open=false;return route.fulfill({status:200,headers,body:'{}'});}
   throw Error(`Unexpected Evolution operation: ${url.pathname}`);
  }return route.abort();
 });
 await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html?wa=1');
 await page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('loan-fixture'));
  const loan={version:1,principal:200,agreedAmount:300,lentAt:'2026-01-01',dueDate:'2027-01-01',lateRate:0,latePeriod:'month'};
  data.items=[{id:'loan-one',folderId:'loan-fixture',itemId:'',name:'Cliente fixture',phone:'5571999990003',price:300,dueDate:loan.dueDate,notes:`<!--AXLOAN:${JSON.stringify(loan)}-->`,isActive:false,payments:[]}];localStorage.setItem('loan-fixture',JSON.stringify(data));
 });await page.reload();
 await page.locator('summary').filter({hasText:'WhatsApp desta pasta'}).click();
 await page.getByRole('button',{name:'Gerar QR',exact:true}).click();
 await page.getByRole('img',{name:'QR Code do WhatsApp de empréstimos desta pasta',exact:true}).waitFor();
 assert.ok(created);assert.ok(!requests.some(r=>r.path.includes('webhook')));
 open=true;await page.getByRole('button',{name:'Atualizar status',exact:true}).click();
 await page.getByText('Empréstimos fixture',{exact:true}).waitFor();assert.equal(await page.getByText('IPTV',{exact:true}).count(),0,'profile must belong to scoped instance, even if server returns all instances');
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByRole('button',{name:'Lembrete',exact:true}).click();await page.getByRole('heading',{name:'Enviar lembrete',exact:true}).waitFor();
 await page.getByLabel('Confira a mensagem',{exact:true}).fill('Mensagem revisada do empréstimo');
 await page.getByRole('button',{name:'Enviar lembrete',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(sends.length,1);assert.equal(sends[0].text,'Mensagem revisada do empréstimo');assert.equal(sends[0].number,'5571999990003');
 await page.reload();await page.locator('summary').filter({hasText:'WhatsApp desta pasta'}).click();await page.getByText('Empréstimos fixture',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Desconectar número desta pasta',exact:true}).click();await page.getByRole('button',{name:'Desconectar',exact:true}).click();
 assert.equal(requests.filter(r=>r.path===`/instance/logout/${instance}`).length,1);assert.ok(!requests.some(r=>r.path.includes('webhook')||r.path.includes('/auxplus-fixturefixture')));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: separate per-folder QR, correct scoped profile, no IPTV webhook or mapping, manual preview and single send, reload, scoped disconnect and mobile/desktop layout. All external operations mocked.');
}finally{await browser.close();await server.close();}
