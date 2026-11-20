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
 await page.getByRole('button',{name:'Histórico do cliente',exact:true}).click();
 await page.getByText('Pegou emprestado',{exact:true}).waitFor();
 assert.equal(await page.getByText('Cadastro no sistema',{exact:true}).isVisible(),false);
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.setViewportSize({width:393,height:900});await page.screenshot({path:'tmp/history-simple-mobile.png'});
 await page.getByText('Mais informações',{exact:true}).click();await page.getByText('Cadastro no sistema',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: simplified history, optional technical details, mobile and desktop widths. No remote writes.');

} finally {await browser.close();await server.close();}
