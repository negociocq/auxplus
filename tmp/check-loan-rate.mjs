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
 await page.getByRole('button',{name:'Novo empréstimo',exact:true}).click();
 await page.getByLabel('Nome do cliente',{exact:true}).fill('Teste taxa');
 await page.getByLabel('WhatsApp com DDI',{exact:true}).fill('5571999999999');
 await page.getByLabel('Valor emprestado (R$)',{exact:true}).fill('200');
 await page.getByLabel('Valor a pagar no vencimento (R$)',{exact:true}).fill('300');
 await page.getByLabel('Data do empréstimo',{exact:true}).fill('2026-10-01');
 await page.getByLabel('Vencimento',{exact:true}).fill('2026-11-01');
 await page.getByLabel('Tipo da taxa',{exact:true}).selectOption('amount');
 await page.getByLabel('Taxa (R$)',{exact:true}).fill('30');
 await page.getByLabel('Período da taxa',{exact:true}).selectOption('month');
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.getByRole('button',{name:'Salvar empréstimo',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 await page.getByRole('button',{name:'Editar',exact:true}).click();
 assert.equal(await page.getByLabel('Tipo da taxa',{exact:true}).inputValue(),'amount');
 assert.equal(await page.getByLabel('Taxa (R$)',{exact:true}).inputValue(),'30');
 await page.getByLabel('Tipo da taxa',{exact:true}).selectOption('percent');
 await page.getByLabel('Taxa (%)',{exact:true}).fill('2');
 await page.getByLabel('Período da taxa',{exact:true}).selectOption('day');
 await page.getByRole('button',{name:'Salvar empréstimo',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
 const terms=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('loan-fixture')).items[0].notes.match(/<!--AXLOAN:([\s\S]*?)-->/)[1]));
 assert.equal(terms.lateRateType,'percent');assert.equal(terms.lateRate,2);assert.equal(terms.latePeriod,'day');assert.deepEqual(errors,[]);
 console.log('PASS: amount and percentage selection, dynamic labels, persistence after reload, daily/monthly selection, widths 320/393/768/1440. No remote writes.');
} finally {await browser.close();await server.close();}
