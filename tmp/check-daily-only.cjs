const fs=require('fs');let s=fs.readFileSync('tmp/check-loan-rate.mjs','utf8');
s=s.replace("await page.getByLabel('Período da taxa',{exact:true}).selectOption('month');", "assert.equal(await page.getByLabel('Período da taxa',{exact:true}).inputValue(),'Ao dia');\n assert.equal(await page.locator('option[value=month]').count(),0);");
s=s.replace("await page.getByLabel('Período da taxa',{exact:true}).selectOption('day');", "assert.equal(await page.getByLabel('Período da taxa',{exact:true}).inputValue(),'Ao dia');");
s=s.replace(" console.log('PASS:", " await page.getByRole('button',{name:'Detalhes',exact:true}).click();assert.equal(await page.getByRole('button',{name:/Pagamento parcial/}).count(),0);\n console.log('PASS:");
s=s.replace('daily/monthly selection','daily-only period and no partial payment action');
fs.writeFileSync('tmp/check-daily-only.mjs',s);
