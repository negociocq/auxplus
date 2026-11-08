import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const file=ts.createSourceFile('webhook.ts',fs.readFileSync('supabase/functions/evolution-webhook/index.ts','utf8'),ts.ScriptTarget.Latest,true);
const declaration=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createMpPix');
const calls=[],context={crypto:webcrypto,TextEncoder,AbortSignal,Date,Uint8Array,fetch:async(_url,init)=>{
 calls.push(init);assert.ok(init.signal,'payment API calls have a deadline');
 return {ok:true,json:async()=>({id:'fixture-order',transactions:{payments:[{payment_method:{qr_code:'fixture-pix'},date_of_expiration:new Date(Date.now()+3600000).toISOString()}]}})};
}};
vm.runInNewContext(ts.transpileModule(declaration.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
const opts={accessToken:'fixture',amount:25,email:'fixture@example.invalid',description:'fixture renewal',externalReference:'auxplus_bot_1_item_inbound-id'};
assert.equal((await context.createMpPix(opts)).qr_code,'fixture-pix');
await context.createMpPix(opts);
assert.equal(calls[0].headers['X-Idempotency-Key'],calls[1].headers['X-Idempotency-Key'],'same incoming event must recover the same payment');
assert.equal(calls[0].body,calls[1].body,'repeated idempotent requests preserve the payment body');
assert.match(calls[0].headers['X-Idempotency-Key'],/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
await context.createMpPix({...opts,externalReference:'auxplus_bot_1_item_different-inbound-id'});
assert.notEqual(calls[0].headers['X-Idempotency-Key'],calls[2].headers['X-Idempotency-Key']);
console.log('PASS: payment API bounded, same inbound event retains payment idempotency and body, independent requests remain distinct; no real payments.');
