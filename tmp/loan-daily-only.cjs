const fs=require('fs');const p='src/components/loan/LoanFolderView.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace('import { nextLoanMonth, recordLoanPayment }','import { dailyLoanRate, nextLoanMonth, recordLoanPayment }');
s=s.replace('latePeriod: "month" as','latePeriod: "day" as');
s=s.replace('lateRate: String(loan?.lateRate || 0)', 'lateRate: String(loan ? dailyLoanRate(loan) : 0)');
s=s.replace('latePeriod: loan?.latePeriod || "month"','latePeriod: "day"');
s=s.replace('const sameLoanConditions = (a: LoanTerms, b: LoanTerms) => loanFinancialFields.every(key => (a[key] ?? (key === "lateRateType" ? "percent" : undefined)) === (b[key] ?? (key === "lateRateType" ? "percent" : undefined)));','const sameLoanConditions = (a: LoanTerms, b: LoanTerms) => dailyLoanRate(a) === dailyLoanRate(b) && loanFinancialFields.filter(key => key !== "lateRate" && key !== "latePeriod").every(key => (a[key] ?? (key === "lateRateType" ? "percent" : undefined)) === (b[key] ?? (key === "lateRateType" ? "percent" : undefined)));');
// Preserve the exact legacy rate on a contact-only edit, avoiding conversion rounding.
s=s.replace('const preservedLoan = { ...previousLoan, ...loan,', 'const preservedLoan = { ...previousLoan, ...loan, ...(previousLoan && dailyLoanRate(previousLoan) === dailyLoanRate(loan) ? { lateRate: previousLoan.lateRate, latePeriod: previousLoan.latePeriod } : {}),');
s=s.replaceAll('money(loan.lateRate)', 'money(dailyLoanRate(loan))');
s=s.replaceAll('${loan.lateRate}%', '${Number(dailyLoanRate(loan).toFixed(8))}%');
s=s.replace('${loan.latePeriod === "day" ? "ao dia" : "ao mês (30 dias)"}', 'ao dia');
s=s.replace('ao ${loan.latePeriod === "day" ? "dia" : "mês (30 dias)"}', 'ao dia');
s=s.replace('                <Button variant="outline" className="col-span-2 h-10 text-xs" onClick={() => openPayment(item, "partial")}>Pagamento parcial · informar valor</Button>\n','');
s=s.replace('"pay" | "interest" | "partial" | "delete"; amount?: string;', '"pay" | "interest" | "delete";');
s=s.replace('"pay" | "interest" | "partial")','"pay" | "interest")');
s=s.replace('kind: action === "interest" ? "interest" : action === "partial" ? "partial" : "full", amount: decimal(confirm.amount || "0"),', 'kind: action === "interest" ? "interest" : "full",');
s=s.replace(' : action === "partial" ? "Pagamento registrado. Saldo atualizado."','');
s=s.replace('confirm?.action === "partial" ? "Registrar pagamento parcial" : ','');
const start=s.indexOf('          {confirm?.action === "partial" ? <>');const end=s.indexOf('confirm?.action === "interest" ? <>',start);
if(start>=0)s=s.slice(0,start)+'          {'+s.slice(end);
s=s.replace('(confirm?.action === "partial" && (!Number.isFinite(decimal(confirm.amount || "0")) || decimal(confirm.amount || "0") <= 0 || decimal(confirm.amount || "0") > (paymentBalance?.total || 0))) || ','');
s=s.replace('aria-label="Como funcionam os juros ao mês e ao dia"','aria-label="Como funcionam os juros ao dia"');
s=s.replace('<p className="font-semibold">Como escolher a taxa e o período?</p>','<p className="font-semibold">Como funcionam os juros ao dia?</p>');
const x=s.indexOf('                  <p>Exemplo em reais:');const y=s.indexOf('                  <p className="border-t',x);
s=s.slice(0,x)+`                  <p><strong>Valor em reais:</strong> R$ 5 ao dia acrescenta R$ 25 em 5 dias de atraso.</p>
                  <p><strong>Porcentagem:</strong> 1% ao dia sobre R$ 1.000 acrescenta R$ 10 por dia. Em 5 dias, o total será R$ 1.050.</p>
`+s.slice(y);
const a=s.indexOf('            <select id="loan-period"');const b=s.indexOf('</select>',a)+9;
s=s.slice(0,a)+'            <Input id="loan-period" value="Ao dia" readOnly />'+s.slice(b);
fs.writeFileSync(p,s);
const h='src/components/loan/LoanClientHistory.tsx';let t=fs.readFileSync(h,'utf8');t=t.replace('import { buildLoanClientHistory }','import { dailyLoanRate } from "@/lib/loans";\nimport { buildLoanClientHistory }');t=t.replaceAll('money(loan.lateRate)','money(dailyLoanRate(loan))').replaceAll('${loan.lateRate}%','${Number(dailyLoanRate(loan).toFixed(8))}%').replace("${loan.latePeriod === 'day' ? 'ao dia' : 'ao mês (30 dias)'}",'ao dia');fs.writeFileSync(h,t);
