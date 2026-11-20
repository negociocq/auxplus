import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Premium%20PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},server:{host:'127.0.0.1',port:5197,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const prefs=new Map();let writes=0;
async function setup(context){await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin==='http://127.0.0.1:5197')return route.continue();
 if(url.pathname==='/rest/v1/platform_settings'){
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
  if(request.method()==='OPTIONS')return route.fulfill({status:200,headers,body:''});
  if(request.method()==='POST'){const data=request.postDataJSON();prefs.set(data.key,data.value);writes++;return route.fulfill({status:201,headers,body:''});}
  const key=url.searchParams.get('key')?.replace(/^eq\./,'');return route.fulfill({status:200,headers,body:JSON.stringify(prefs.has(key)?[{value:prefs.get(key)}]:[])});
 }return route.abort();
});}
async function order(page){return page.getByRole('tab').allTextContents();}
async function waitOrder(page,expected){await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('[role=tab]')].map(e=>e.textContent))===JSON.stringify(expected),expected);}
try{
 const context=await browser.newContext({viewport:{width:393,height:852}});await setup(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5197/tmp/folder-tabs-preview.html');await waitOrder(page,['Clientes','Empréstimos','Dívidas']);
 const source=await page.getByRole('tab',{name:'Empréstimos',exact:true}).boundingBox(),target=await page.getByRole('tab',{name:'Clientes',exact:true}).boundingBox();
 await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+10,target.y+target.height/2,{steps:15});await page.waitForTimeout(200);await page.mouse.up();
 await waitOrder(page,['Empréstimos','Clientes','Dívidas']);await page.waitForFunction(()=>localStorage.getItem('auxplus-folder-tab-order:fixture1')?.includes('Produto'));
 await page.waitForTimeout(150);assert.deepEqual(prefs.get('folder_tab_order_user_fixture1').order,['Produto','Cliente','Dívida']);
 await page.getByRole('tab',{name:'Dívidas',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Dívidas',exact:true}).getAttribute('aria-selected'),'true');
 await page.reload();await waitOrder(page,['Empréstimos','Clientes','Dívidas']);assert.equal(await page.getByRole('tab',{name:'Empréstimos',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Dívidas',exact:true}).focus();await page.keyboard.press('Alt+ArrowLeft');await waitOrder(page,['Empréstimos','Dívidas','Clientes']);
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
 const fresh=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});await setup(fresh);const mobile=await fresh.newPage();
 await mobile.goto('http://127.0.0.1:5197/tmp/folder-tabs-preview.html');await waitOrder(mobile,['Empréstimos','Dívidas','Clientes']);
 await mobile.waitForTimeout(400);
 await mobile.evaluate(()=>{window.__pointer=[];for(const type of ['pointerdown','pointercancel','pointerup'])document.addEventListener(type,e=>window.__pointer.push([type,e.pointerType,e.target.closest('[role=tab]')?.textContent]));});
 const cdp=await fresh.newCDPSession(mobile);const from=await mobile.getByRole('tab',{name:'Clientes',exact:true}).boundingBox(),to=await mobile.getByRole('tab',{name:'Empréstimos',exact:true}).boundingBox();
 const x=from.x+from.width/2,y=from.y+from.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await mobile.waitForTimeout(100);
 for(let i=1;i<=15;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(to.x+5-x)*i/15,y}]});await mobile.waitForTimeout(15);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(300);console.log('Touch order',JSON.stringify(await order(mobile)),JSON.stringify(await mobile.evaluate(()=>window.__pointer)));await mobile.screenshot({path:'tmp/folder-tabs-touch-debug.png'});await waitOrder(mobile,['Clientes','Empréstimos','Dívidas']);
 await mobile.screenshot({path:'tmp/folder-tabs-mobile.png'});
 await mobile.goto('http://127.0.0.1:5197/tmp/folder-tabs-preview.html?user=fixture2');await waitOrder(mobile,['Clientes','Empréstimos','Dívidas']);
 assert.equal(prefs.has('folder_tab_order_user_fixture2'),false,'new account must not inherit or write another preference');assert.ok(writes>=3);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: mouse and genuine touch reorder; keyboard alternative; click selection; local reload; remote sync to clean browser; account isolation; 320/393/768/1440px; no real remote requests.');
}finally{await browser.close();await server.close();}
