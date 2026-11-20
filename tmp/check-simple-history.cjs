const fs=require('fs');let s=fs.readFileSync('tmp/check-loan-partial.mjs','utf8');const a=s.indexOf(' const interest=');const b=s.indexOf('\n} finally',a);
s=s.slice(0,a)+` await page.getByRole('button',{name:'Histórico do cliente',exact:true}).click();
 await page.getByText('Pegou emprestado',{exact:true}).waitFor();
 assert.equal(await page.getByText('Cadastro no sistema',{exact:true}).isVisible(),false);
 for(const width of [320,393,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
 await page.setViewportSize({width:393,height:900});await page.screenshot({path:'tmp/history-simple-mobile.png'});
 await page.getByText('Mais informações',{exact:true}).click();await page.getByText('Cadastro no sistema',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: simplified history, optional technical details, mobile and desktop widths. No remote writes.');
`+s.slice(b);fs.writeFileSync('tmp/check-simple-history.mjs',s);
