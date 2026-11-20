const fs=require('fs');const p='src/components/loan/LoanClientHistory.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace('sm:max-w-2xl','sm:max-w-xl');
const start=s.indexOf('      <p className="text-xs text-muted-foreground">{history.phone');
const end=s.indexOf('      <div className="space-y-3">{history.entries',start);
s=s.slice(0,start)+`      <div className="grid grid-cols-3 gap-2">{[
        ["Pegou", money(history.totalLent)], ["Já pagou", money(history.totalReceived)], ["Falta pagar", money(history.outstanding)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/20 px-2 py-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-semibold tabular-nums min-[360px]:text-sm">{value}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{num(history.loanCount)} empréstimo(s) · {num(history.paymentCount)} pagamento(s) · {num(history.openCount)} em aberto</p>
`+s.slice(end);
const begin=s.indexOf('        <dl className="mt-3');const finish=s.indexOf('\n      </article>',begin);
// Retain the old technical data in an optional, collapsed section.
const oldDetails=s.slice(begin,s.indexOf('        <div className="mt-3 border-t',begin));
s=s.slice(0,begin)+`        <ol className="mt-2 divide-y">
          <li className="flex items-start justify-between gap-3 py-2"><div className="min-w-0"><p className="text-sm font-medium">Pegou emprestado</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBrDate(loan.lentAt)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(loan.principal)}</span></li>
          {[...receipts].sort((a,b) => a.paidAt.localeCompare(b.paidAt)).map(receipt => <li key={receipt.id} className="py-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium">{receipt.kind === "interest" ? "Pagou somente juros" : receipt.kind === "partial" ? "Pagou uma parte" : "Pagou e quitou"}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBrDate(receipt.paidAt)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums text-success">{money(receipt.amount)}</span></div>{receipt.nextDueDate && <p className="mt-1 text-xs text-muted-foreground">Novo vencimento: {formatBrDate(receipt.nextDueDate)}</p>}</li>)}
        </ol>
        {!receipts.length && <p className="pb-2 text-xs text-muted-foreground">Ainda não há pagamento registrado.</p>}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div className="min-w-0"><p className="text-xs font-medium">{loan.paidAt ? "Tudo pago" : "Falta pagar"}</p>{!loan.paidAt && <p className="mt-0.5 text-[11px] text-muted-foreground">Vencimento: {formatBrDate(loan.dueDate)}</p>}</div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(balance.outstanding)}</span></div>
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Mais informações</summary>
${oldDetails}
        <p className="mt-3 text-xs text-muted-foreground">Capital pago: {money(receipts.reduce((sum, receipt) => sum + receipt.principalPaid, 0))} · Juros pagos: {money(receipts.reduce((sum, receipt) => sum + receipt.interestPaid, 0))}</p>
        </details>`+s.slice(finish);
const a=s.indexOf('      {(history.unconfigured');const b=s.indexOf('\n    </div>}',a);
s=s.slice(0,a)+'      {history.unconfigured > 0 && <p className="text-xs text-muted-foreground">Há {num(history.unconfigured)} registro(s) antigo(s) sem valores completos, fora destes totais.</p>}'+s.slice(b);
s=s.replace('className="text-sm font-semibold">{folders.find', 'className="text-xs text-muted-foreground">{folders.find');
s=s.replace(' || "Empréstimo"} · {formatBrDate(loan.lentAt)}</h3>',' || "Empréstimo"}</h3>');
fs.writeFileSync(p,s);
