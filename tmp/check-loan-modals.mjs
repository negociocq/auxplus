import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});
await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  const page=await browser.newPage();
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:5197')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html');
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('loan-fixture'));
    const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const now=new Date();const future=new Date(now);future.setDate(future.getDate()+3);
    const loan={version:1,principal:200,agreedAmount:500,lentAt:dateKey(now),dueDate:dateKey(future),lateRate:3,latePeriod:'month'};
    data.items=[{id:'breno',folderId:'loan-fixture',itemId:'',name:'Breno',phone:'+5571992220323',price:500,dueDate:loan.dueDate,isActive:false,payments:[],notes:`<!--AXLOAN:${JSON.stringify(loan)}-->`}];
    localStorage.setItem('loan-fixture',JSON.stringify(data));
  });
  await page.reload();
  const summary=async label=>page.getByText(label,{exact:true}).locator('..').innerText();
  assert.match(await summary('Total a receber'),/500,00/);
  assert.match(await summary('Vence hoje'),/0,00/);
  async function checkDialog(width) {
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await page.waitForTimeout(250);
    const b=await dialog.boundingBox();
    assert.ok(b.x>=-1&&b.x+b.width<=width+1,`modal outside viewport ${width}`);
    assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`modal horizontal overflow ${width}`);
    return dialog;
  }
  async function aligned(a,b) {
    const x=await a.boundingBox(),y=await b.boundingBox();
    assert.ok(Math.abs(x.y-y.y)<1,`unaligned y: ${x.y}/${y.y}`);
    assert.ok(Math.abs(x.height-y.height)<1,`unaligned heights: ${x.height}/${y.height}`);
  }
  for (const width of [320,393,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'Novo empréstimo',exact:true}).click();
    const form=await checkDialog(width);
    await aligned(page.getByLabel('Valor emprestado (R$)',{exact:true}),page.getByLabel('Valor a pagar no vencimento (R$)',{exact:true}));
    await aligned(page.getByLabel('Taxa (%)',{exact:true}),page.getByLabel('Período da taxa',{exact:true}));
    await aligned(form.getByRole('button',{name:'Cancelar',exact:true}),form.getByRole('button',{name:'Salvar empréstimo',exact:true}));
    if(width===393||width===1440)await page.screenshot({path:`tmp/loan-form-${width}.png`,fullPage:true});
    await form.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Detalhes',exact:true}).click();
    const detail=await checkDialog(width);
    await aligned(detail.getByRole('button',{name:'Editar',exact:true}),detail.getByRole('button',{name:'Lembrete',exact:true}));
    if(width===393||width===1440)await page.screenshot({path:`tmp/loan-detail-${width}.png`,fullPage:true});
    await detail.getByRole('button',{name:'Registrar pagamento',exact:true}).click();
    const confirm=await checkDialog(width);
    await aligned(confirm.getByRole('button',{name:'Cancelar',exact:true}),confirm.getByRole('button',{name:'Confirmar',exact:true}));
    await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('loan-fixture'));const row=data.items[0];
    const loan=JSON.parse(row.notes.match(/<!--AXLOAN:([\s\S]*?)-->/)[1]);
    loan.dueDate=loan.lentAt;row.dueDate=loan.dueDate;row.notes=`<!--AXLOAN:${JSON.stringify(loan)}-->`;
    localStorage.setItem('loan-fixture',JSON.stringify(data));
  });
  await page.reload();assert.match(await summary('Vence hoje'),/500,00/);
  console.log('PASS: future R$500 excluded from due-today; due-today R$500 included; form/detail/confirmation fit and buttons align at 320,393,768,1440px; no real data or messages.');
} finally {await browser.close();await server.close();}
