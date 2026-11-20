import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:393,height:852}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5197')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html');
 await page.getByRole('button',{name:'Editar lembrete',exact:true}).click();
 const input=page.locator('#loan-reminder-message');
 assert.ok((await input.inputValue()).includes('vence em 2 dias'));
 await input.fill('Antes: {name}, vencimento {due_date}, total {total}');
 await page.getByRole('tab',{name:'No vencimento',exact:true}).click();
 assert.ok((await input.inputValue()).includes('Hoje é o vencimento'));
 await input.fill('Hoje: {name}, pagar {total} por PIX {pix}');
 await page.getByRole('tab',{name:'2 dias antes',exact:true}).click();
 assert.equal(await input.inputValue(),'Antes: {name}, vencimento {due_date}, total {total}');
 for(const width of [320,393,768,1440]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 }
 await page.getByRole('button',{name:'Salvar mensagens',exact:true}).click();await page.reload();
 await page.getByRole('button',{name:'Editar lembrete',exact:true}).click();
 assert.equal(await input.inputValue(),'Antes: {name}, vencimento {due_date}, total {total}');
 await page.getByRole('tab',{name:'No vencimento',exact:true}).click();
 assert.equal(await input.inputValue(),'Hoje: {name}, pagar {total} por PIX {pix}');
 await input.fill('');assert.ok(await page.getByRole('button',{name:'Salvar mensagens',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Editar lembrete',exact:true}).click();
 await page.getByRole('tab',{name:'No vencimento',exact:true}).click();
 assert.equal(await input.inputValue(),'Hoje: {name}, pagar {total} por PIX {pix}');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: separate stage drafts, switch without data loss, save/reload both messages, cancel, empty validation and responsive modal. No real requests or sends.');
}finally{await browser.close();await server.close();}
