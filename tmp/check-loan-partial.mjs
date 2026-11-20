import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:393,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5197')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html');
 await page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('loan-fixture'));const now=new Date();const day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const terms={version:1,principal:200,agreedAmount:300,lentAt:day,dueDate:day,lateRate:0,latePeriod:'month'};
  data.items=[{id:'partial-example',folderId:'loan-fixture',itemId:'',name:'Teste parcial',phone:'5571999999999',price:300,dueDate:day,isActive:false,payments:[],notes:`<!--AXLOAN:${JSON.stringify(terms)}-->`}];localStorage.setItem('loan-fixture',JSON.stringify(data));
 });
 await page.reload();await page.getByRole('button',{name:'Detalhes',exact:true}).click();
 const interest=page.getByRole('button',{name:/^Somente juros/});const full=page.getByRole('button',{name:/Quitar tudo/});
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});const a=await interest.boundingBox(),b=await full.boundingBox();assert.ok(Math.abs(a.y-b.y)<1);assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.setViewportSize({width:393,height:900});await page.getByRole('button',{name:/Pagamento parcial/}).click();
 const amount=page.getByLabel('Valor recebido (R$)',{exact:true});const confirm=page.getByRole('button',{name:'Confirmar',exact:true});
 for(const invalid of ['0','-1','301','abc']){await amount.fill(invalid);assert.equal(await confirm.isDisabled(),true);}
 await amount.fill('50');await page.getByText('R$ 250,00',{exact:true}).waitFor();
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await confirm.evaluate(button=>{button.click();button.click();});await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 const read=()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('loan-fixture')).items[0].notes.match(/<!--AXLOAN:([\s\S]*?)-->/)[1]));
 let loan=await read();assert.equal(loan.receipts.length,1);assert.equal(loan.receipts[0].amount,50);assert.equal(loan.receipts[0].kind,'partial');assert.equal(loan.balanceState.agreedAmount,250);
 await page.getByRole('button',{name:'Editar',exact:true}).click();assert.equal(await page.getByLabel('Valor emprestado (R$)',{exact:true}).isDisabled(),true);
 await page.getByLabel('Observações',{exact:true}).fill('Pagamento preservado');await page.getByRole('button',{name:'Salvar empréstimo',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 loan=await read();assert.equal(loan.receipts.length,1);assert.equal(loan.balanceState.agreedAmount,250);
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.getByRole('button',{name:/^Somente juros/}).getByText('R$ 50,00',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Pagamento parcial/}).click();await amount.fill('150');await confirm.click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 loan=await read();assert.equal(loan.balanceState.principal,100);assert.equal(loan.balanceState.agreedAmount,100);assert.equal(loan.receipts.length,2);
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();assert.equal(await page.getByRole('button',{name:/^Somente juros/}).isDisabled(),true);
 await page.getByRole('button',{name:/Quitar tudo/}).click();await confirm.click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 loan=await read();assert.ok(loan.paidAt);assert.equal(loan.receipts.reduce((s,r)=>s+r.amount,0),300);assert.equal(loan.receipts.reduce((s,r)=>s+r.principalPaid,0),200);assert.deepEqual(errors,[]);
 console.log('PASS: arbitrary partial amount, invalid amount rejection, remaining preview, no double subtraction, reload, preserved history on contact edit, second partial and final settlement, compact mobile/desktop layouts. No real messages or database writes.');
} finally {await browser.close();await server.close();}
