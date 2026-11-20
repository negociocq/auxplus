import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:393,height:852}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5197')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5197/tmp/loan-preview.html');
 for(const [before,onday,label] of [[true,false,'somente 2 dias antes'],[false,true,'somente no vencimento'],[true,true,'2 dias antes e no vencimento'],[false,false,null]]){
  await page.locator('summary').filter({hasText:'Envio automático'}).click();
  await page.getByLabel('Enviar 2 dias antes',{exact:true}).setChecked(before);
  await page.getByLabel('Enviar no vencimento',{exact:true}).setChecked(onday);
  await page.getByLabel('Horário de Brasília',{exact:true}).fill('10:25');
  await page.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
  await page.reload();
  await page.getByText(label?`Automático: ${label} · 10:25`:'Envio automático desligado',{exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'Envio automático'}).click();
  assert.equal(await page.getByLabel('Enviar 2 dias antes',{exact:true}).isChecked(),before);
  assert.equal(await page.getByLabel('Enviar no vencimento',{exact:true}).isChecked(),onday);
  assert.equal(await page.getByLabel('Horário de Brasília',{exact:true}).inputValue(),'10:25');
  for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('summary').filter({hasText:'Envio automático'}).click();
 }
 console.log('PASS: before-only, due-day-only, both, neither; save/reload and retained time; responsive widths. No remote writes or messages.');
}finally{await browser.close();await server.close();}
