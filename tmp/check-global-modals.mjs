import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:[{find:'@/context/AppContext',replacement:path.resolve('tmp/loan-preview-context.tsx')},{find:'@',replacement:path.resolve('src')}]},server:{host:'127.0.0.1',port:5197,strictPort:true}});
await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5197')?r.continue():r.abort());
 for(const width of [320,393,768,1440]){
  await page.setViewportSize({width,height:850});
  await page.goto('http://127.0.0.1:5197/tmp/modal-standard-preview.html');
  for(const mode of ['Formulário','Longo','Três ações','Quatro ações','Largo','Confirmação','Busca']){
   await page.getByRole('button',{name:mode,exact:true}).click();
   const dialog=page.getByRole(mode==='Confirmação'?'alertdialog':'dialog');await dialog.waitFor();await page.waitForTimeout(220);
   const bounds=await dialog.boundingBox();
   assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1,`${mode} outside ${width}`);
   assert.ok(bounds.y>=-1&&bounds.y+bounds.height<=851,`${mode} height outside ${width}`);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${mode} overflow ${width}`);
   const footer=page.getByTestId('footer');await footer.scrollIntoViewIfNeeded();
   const buttons=await footer.locator('button').all();
   const a=await buttons[0].boundingBox(),b=await buttons[1].boundingBox();
   assert.ok(Math.abs(a.y-b.y)<1,`${mode} buttons not aligned ${width}`);
   assert.ok(Math.abs(a.width-b.width)<1,`${mode} widths differ ${width}`);
   assert.ok(Math.abs(a.height-b.height)<1,`${mode} heights differ ${width}`);
   assert.ok(a.height>=44,`${mode} touch height ${width}`);
   if(mode==='Formulário'){
    const padding=await dialog.evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft));assert.ok(padding>=16);
   }
   if(mode==='Quatro ações'&&(width===393||width===1440))await page.screenshot({path:`tmp/global-modal-${width}.png`});
   await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  await page.goto('http://127.0.0.1:5197/tmp/modal-standard-preview.html?debt=1');
  await page.getByRole('button',{name:'Nova dívida',exact:true}).first().click();
  const debt=page.getByRole('dialog');await debt.waitFor();await page.waitForTimeout(220);
  assert.ok(await debt.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`real debt overflow ${width}`);
  await debt.getByRole('button',{name:'Adicionar dívida',exact:true}).scrollIntoViewIfNeeded();
  if(width===393)await page.screenshot({path:'tmp/global-debt-modal.png'});
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: default/long/3-action/4-action/wide/search/alert dialogs and actual debt form at 320/393/768/1440px; equal button dimensions and touch heights, padding, bounded scrolling, no JS errors or external requests.');
}finally{await browser.close();await server.close()}
