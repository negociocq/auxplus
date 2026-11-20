import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync('tmp/uniplay-zuxo/panel.js','utf8'),ast=ts.createSourceFile('panel.js',source,ts.ScriptTarget.Latest,true);
const arr=ast.statements[1].body.statements[0].declarationList.declarations[0].initializer.elements.map(n=>n.text);
const lower='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=',standard='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const cache=new Map();const decode=s=>{if(!cache.has(s))cache.set(s,Buffer.from([...s].map(c=>standard[lower.indexOf(c)]||'').join(''),'base64').toString('utf8'));return cache.get(s)};
const d=n=>decode(arr[n-0x15a]);let rotations=0;
for(;rotations<arr.length;rotations++){const v=-parseInt(d(0x32c8))+parseInt(d(0x3bb4))/2*(-parseInt(d(0x1d75))/3)-parseInt(d(0x1335))/4*(parseInt(d(0x4846))/5)-parseInt(d(0x3146))/6*(parseInt(d(0x3f66))/7)-parseInt(d(0x3e00))/8+parseInt(d(0x402))/9*(-parseInt(d(0x4f07))/10)+parseInt(d(0x4a6a))/11;if(v===0xaa66a)break;arr.push(arr.shift());}
if(rotations===arr.length)throw Error('Decoder not resolved');
console.log('String table resolved without executing the panel application',rotations);
const aliases=new Set(['a0_0x3d4a']);for(let pass=0;pass<6;pass++)for(const m of source.matchAll(/\b(_0x[0-9a-f]+)\s*=\s*(a0_0x3d4a|_0x[0-9a-f]+)\s*[,;]/g))if(aliases.has(m[2]))aliases.add(m[1]);
let decoded=source.replace(/\b(a0_0x3d4a|_0x[0-9a-f]+)\((0x[0-9a-f]+)\)/g,(full,name,n)=>aliases.has(name)?JSON.stringify(d(Number(n))):full);
for(let pass=0;pass<12;pass++){const next=decoded.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\+\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,(full,a,b)=>{const parse=t=>ts.createSourceFile('s.ts','const s='+t,ts.ScriptTarget.Latest,true).statements[0].declarationList.declarations[0].initializer.text;return JSON.stringify(parse(a)+parse(b))});if(next===decoded)break;decoded=next;}
const a=ts.createSourceFile('decoded.js',decoded,ts.ScriptTarget.Latest,true);const dictionary=new Map();function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(a)==='_0x35e800'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer))for(const p of n.initializer.properties)if(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer))dictionary.set(p.name.text,p.initializer.text);ts.forEachChild(n,walk)}walk(a);
decoded=decoded.replace(/_0x35e800\[("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/g,(full,key)=>{const k=ts.createSourceFile('s.ts','const s='+key,ts.ScriptTarget.Latest,true).statements[0].declarationList.declarations[0].initializer.text;return dictionary.has(k)?JSON.stringify(dictionary.get(k)):full});
fs.writeFileSync('tmp/uniplay-zuxo/panel-decoded.js',decoded);
for(const t of ["'activeAppZuxo'","async 'activateZuxo'"]){const i=decoded.indexOf(t);console.log(decoded.slice(i,i+5700))}
