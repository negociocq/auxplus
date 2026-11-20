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
 const expected=await page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('loan-fixture'));const date=new Date();date.setDate(date.getDate()+3);
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const due=key(date);const next=new Date(Date.UTC(date.getFullYear(),date.getMonth()+1,date.getDate(),12));
  const terms={version:1,principal:200,agreedAmount:300,lentAt:key(new Date()),dueDate:due,lateRate:0,latePeriod:'month'};
  data.items=[{id:'interest-example',folderId:'loan-fixture',itemId:'',name:'Exemplo 200 + 100',phone:'5571999999999',price:300,dueDate:due,isActive:false,payments:[],notes:`<!--AXLOAN:${JSON.stringify(terms)}-->`}];
  localStorage.setItem('loan-fixture',JSON.stringify(data));return {due,next:key(next)};
 });
 await page.reload();await page.getByRole('button',{name:'Detalhes',exact:true}).click();
 const interest=page.getByRole('button',{name:/^Somente juros/});const full=page.getByRole('button',{name:/Quitar tudo/});
 assert.match(await interest.innerText(),/100,00/);assert.match(await full.innerText(),/300,00/);
 for(const width of [320,393,768,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(250);const a=await interest.boundingBox(),b=await full.boundingBox();
  assert.ok(Math.abs(a.y-b.y)<1);assert.ok(Math.abs(a.width-b.width)<1);
  assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 }
 await page.setViewportSize({width:393,height:900});await interest.click();
 assert.equal(await page.getByLabel('Novo vencimento',{exact:true}).inputValue(),expected.next);
 await page.waitForTimeout(300);
 await page.screenshot({path:'tmp/loan-interest-confirm-mobile.png'});
 await page.getByRole('button',{name:'Confirmar',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.reload();
 const read=()=>page.evaluate(()=>{const item=JSON.parse(localStorage.getItem('loan-fixture')).items[0];return {item,loan:JSON.parse(item.notes.match(/<!--AXLOAN:([\s\S]*?)-->/)[1])};});
 let value=await read();assert.equal(value.loan.dueDate,expected.next);assert.equal(value.item.dueDate,expected.next);
 assert.equal(value.loan.principal,200);assert.equal(value.loan.agreedAmount,300);assert.equal(value.loan.receipts.length,1);
 assert.equal(value.loan.receipts[0].amount,100);assert.equal(value.loan.receipts[0].principalPaid,0);assert.equal(value.loan.paidAt,undefined);assert.equal(value.item.payments.length,0);
 await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Observações',{exact:true}).fill('Histórico preservado após edição');
 await page.getByRole('button',{name:'Salvar empréstimo',exact:true}).click();await page.reload();value=await read();assert.equal(value.loan.receipts.length,1);
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();await page.locator('summary').filter({hasText:'Histórico de pagamentos'}).click();
 await page.getByRole('dialog').getByRole('listitem').getByText('Somente juros',{exact:true}).waitFor();await page.getByRole('button',{name:/Quitar tudo/}).click();
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.reload();
 value=await read();assert.equal(value.loan.paidAmount,300);assert.equal(value.loan.receipts.length,2);assert.equal(value.loan.receipts.reduce((s,r)=>s+r.amount,0),400);
 assert.equal(value.loan.receipts[1].principalPaid,200);assert.equal(value.loan.receipts[1].interestPaid,100);assert.equal(value.item.payments.length,0);
 await page.getByRole('combobox',{name:'Filtrar empréstimos'}).selectOption('paid');await page.getByText('Quitado',{exact:true}).waitFor();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: R$100 interest-only receipt, R$200 retained capital, next due +1 month, double-click guard, reload, history survives edits, R$300 full settlement and lifetime R$400 received; responsive actions. No real records or sends.');
}finally{await browser.close();await server.close();}
