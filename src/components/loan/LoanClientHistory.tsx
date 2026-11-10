import { useMemo } from "react";
import type { Folder, Item } from "@/types";
import { buildLoanClientHistory } from "@/lib/loanClientHistory";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function LoanClientHistory({ selected, items, folders, today, onClose }: { selected: Item | null; items: Item[]; folders: Folder[]; today: string; onClose: () => void }) {
  const { money, phone: displayPhone, num } = useHideBalance();
  const history = useMemo(() => selected ? buildLoanClientHistory(selected, items, folders.map(f => f.id), today) : null, [selected, items, folders, today]);
  return <Dialog open={!!selected} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="sm:max-w-xl">
    <DialogHeader><DialogTitle>Histórico do cliente</DialogTitle><DialogDescription>{selected?.name} · {displayPhone(selected?.phone) || "Sem telefone"}</DialogDescription></DialogHeader>
    {history && <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">{[
        ["Pegou", money(history.totalLent)], ["Já pagou", money(history.totalReceived)], ["Falta pagar", money(history.outstanding)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/20 px-2 py-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-semibold tabular-nums min-[360px]:text-sm">{value}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{num(history.loanCount)} empréstimo(s) · {num(history.paymentCount)} pagamento(s) · {num(history.openCount)} em aberto</p>
      <div className="space-y-3">{history.entries.map(({ item, loan, receipts, balance, registeredAt, initialDueDate }) => <article key={item.id} className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs text-muted-foreground">{folders.find(f => f.id === item.folderId)?.name || "Empréstimo"}</h3><span className={`rounded-full px-2 py-1 text-xs ${loan.paidAt ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>{loan.paidAt ? 'Quitado' : 'Em aberto'}</span></div>
        <ol className="mt-2 divide-y">
          <li className="flex items-start justify-between gap-3 py-2"><div className="min-w-0"><p className="text-sm font-medium">Pegou emprestado</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBrDate(loan.lentAt)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(loan.principal)}</span></li>
          {[...receipts].sort((a,b) => a.paidAt.localeCompare(b.paidAt)).map(receipt => <li key={receipt.id} className="py-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium">{receipt.kind === "interest" ? "Pagou somente juros" : receipt.kind === "partial" ? "Pagou uma parte" : "Pagou e quitou"}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatBrDate(receipt.paidAt)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums text-success">{money(receipt.amount)}</span></div>{receipt.nextDueDate && <p className="mt-1 text-xs text-muted-foreground">Novo vencimento: {formatBrDate(receipt.nextDueDate)}</p>}</li>)}
        </ol>
        {!receipts.length && <p className="pb-2 text-xs text-muted-foreground">Ainda não há pagamento registrado.</p>}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div className="min-w-0"><p className="text-xs font-medium">{loan.paidAt ? "Tudo pago" : "Falta pagar"}</p>{!loan.paidAt && <p className="mt-0.5 text-[11px] text-muted-foreground">Vencimento: {formatBrDate(loan.dueDate)}</p>}</div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(balance.outstanding)}</span></div>
        <details className="group mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground"><span className="group-open:hidden">Mais informações</span><span className="hidden group-open:inline">Menos informações</span></summary>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          {[['Valor emprestado', money(loan.principal)], ['Valor combinado do período', money(loan.agreedAmount)], ['Data do empréstimo', formatBrDate(loan.lentAt)], ['Cadastro no sistema', registeredAt ? formatBrDate(registeredAt) : 'Não registrado nos dados antigos'], ['Vencimento inicial', initialDueDate ? formatBrDate(initialDueDate) : 'Não registrado separadamente'], ['Vencimento atual', formatBrDate(loan.dueDate)], ['Taxa por atraso', loan.lateRate ? `${loan.lateRateType === "amount" ? money(loan.lateRate) : `${loan.lateRate}%`} ${loan.latePeriod === 'day' ? 'ao dia' : 'ao mês (30 dias)'}` : 'Sem juros por atraso'], ['Saldo atual', money(balance.outstanding)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-medium">{value}</dd></div>)}
        </dl>

        <p className="mt-3 text-xs text-muted-foreground">Capital pago: {money(receipts.reduce((sum, receipt) => sum + receipt.principalPaid, 0))} · Juros pagos: {money(receipts.reduce((sum, receipt) => sum + receipt.interestPaid, 0))}</p>
        </details>
      </article>)}</div>
      {history.unconfigured > 0 && <p className="text-xs text-muted-foreground">Há {num(history.unconfigured)} registro(s) antigo(s) sem valores completos, fora destes totais.</p>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
