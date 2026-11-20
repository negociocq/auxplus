import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:393,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5197')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html');
 await page.evaluate(async()=>{
  const {recordLoanPayment,writeLoan}=await import('/src/lib/loans.ts');
  const data=JSON.parse(localStorage.getItem('loan-fixture'));
  data.folders.push({id:'secondary',userId:'fixture',type:'Produto',name:'Outra pasta minha'},{id:'forbidden',userId:'different',type:'Produto',name:'Outra conta'});
  const phone='5511999990001';
  const original={version:1,principal:200,agreedAmount:300,lentAt:'2026-08-13',dueDate:'2026-09-13',lateRate:0,latePeriod:'month',registeredAt:'2026-08-13T12:00:00Z',initialDueDate:'2026-09-13'};
  const rolled=recordLoanPayment(original,{id:'i1',kind:'interest',paidAt:'2026-09-13T12:00:00Z',nextDueDate:'2026-10-13'});
  const paid=recordLoanPayment(rolled,{id:'f1',kind:'full',paidAt:'2026-10-13T12:00:00Z'});
  const open={...original,principal:500,agreedAmount:600,lentAt:'2026-11-01',dueDate:'2027-01-13',initialDueDate:'2027-01-13'};
  const item=(id,folderId,loan,number=phone)=>({id,folderId,itemId:'',name:'Cliente histórico',phone:number,price:loan.agreedAmount,dueDate:loan.dueDate,notes:writeLoan('',loan),isActive:false,payments:[]});
  data.items=[item('paid','loan-fixture',paid),item('open','secondary',open),item('other','loan-fixture',open,'5511999990002'),item('hidden-account','forbidden',{...open,principal:999,agreedAmount:999})];
  localStorage.setItem('loan-fixture',JSON.stringify(data));
 });
 await page.reload();await page.getByRole('combobox',{name:'Filtrar empréstimos'}).selectOption('paid');
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByRole('button',{name:'Histórico do cliente',exact:true}).click();
 const dialog=page.getByRole('dialog');await page.getByRole('heading',{name:'Histórico do cliente',exact:true}).waitFor();await page.waitForTimeout(250);
 const total=label=>dialog.getByText(label,{exact:true}).locator('..').innerText();
 assert.match(await total('Total emprestado'),/700,00/);assert.match(await total('Total recebido'),/400,00/);assert.match(await total('Saldo a receber'),/600,00/);
 assert.match(await total('Capital recebido'),/200,00/);assert.match(await total('Juros recebidos'),/200,00/);
 await dialog.getByText('Outra pasta minha · 01/11/2026',{exact:true}).waitFor();
 await dialog.getByText(/^Somente juros · 13\/09\/2026/).waitFor();
 await dialog.getByText(/^Quitação total · 13\/10\/2026/).waitFor();
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.setViewportSize({width:393,height:900});await dialog.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(250);await page.screenshot({path:'tmp/loan-client-history-mobile.png'});
 await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Novo empréstimo',exact:true}).click();
 for(const [label,value]of [['Nome do cliente','Cadastro novo'],['Valor emprestado (R$)','200'],['Valor a pagar no vencimento (R$)','300'],['Data do empréstimo','2026-01-01'],['Vencimento','2027-01-01']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Salvar empréstimo',exact:true}).click();await page.reload();
 const created=await page.evaluate(()=>{const item=JSON.parse(localStorage.getItem('loan-fixture')).items.find(i=>i.name==='Cadastro novo');return JSON.parse(item.notes.match(/<!--AXLOAN:([\s\S]*?)-->/)[1]);});
 assert.ok(created.registeredAt);assert.equal(created.lentAt,'2026-01-01');assert.ok(!created.registeredAt.startsWith('2026-01-01'));assert.equal(created.initialDueDate,'2027-01-01');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS browser: account-scoped consolidated client history, multiple folders, exact totals and dated receipts/rollover, responsive modal, true new registration timestamp independent of lending date. No real records or sends.');
}finally{await browser.close();await server.close();}
