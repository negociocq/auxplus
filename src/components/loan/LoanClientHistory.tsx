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
  return <Dialog open={!!selected} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="sm:max-w-2xl">
    <DialogHeader><DialogTitle>Histórico do cliente</DialogTitle><DialogDescription>{selected?.name} · {displayPhone(selected?.phone) || "Sem telefone"}</DialogDescription></DialogHeader>
    {history && <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{history.phone ? "Reúne os empréstimos com este telefone nas suas pastas de Empréstimos." : "Sem telefone válido: mostrando somente este empréstimo, para não misturar clientes com nomes parecidos."}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[
        ["Empréstimos", num(history.loanCount)], ["Total emprestado", money(history.totalLent)], ["Total recebido", money(history.totalReceived)],
        ["Capital recebido", money(history.principalReceived)], ["Juros recebidos", money(history.interestReceived)], ["Saldo a receber", money(history.outstanding)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{num(history.openCount)} em aberto · {num(history.paidCount)} quitados · {num(history.paymentCount)} pagamentos registrados{history.firstLoanAt ? ` · Primeiro empréstimo: ${formatBrDate(history.firstLoanAt)}` : ""}. Capital ainda emprestado: {money(history.principalOutstanding)}.</p>
      <div className="space-y-3">{history.entries.map(({ item, loan, receipts, balance, registeredAt, initialDueDate }) => <article key={item.id} className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{folders.find(f => f.id === item.folderId)?.name || "Empréstimo"} · {formatBrDate(loan.lentAt)}</h3><span className={`rounded-full px-2 py-1 text-xs ${loan.paidAt ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>{loan.paidAt ? 'Quitado' : 'Em aberto'}</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          {[['Valor emprestado', money(loan.principal)], ['Valor combinado do período', money(loan.agreedAmount)], ['Data do empréstimo', formatBrDate(loan.lentAt)], ['Cadastro no sistema', registeredAt ? formatBrDate(registeredAt) : 'Não registrado nos dados antigos'], ['Vencimento inicial', initialDueDate ? formatBrDate(initialDueDate) : 'Não registrado separadamente'], ['Vencimento atual', formatBrDate(loan.dueDate)], ['Taxa por atraso', loan.lateRate ? `${loan.lateRateType === "amount" ? money(loan.lateRate) : `${loan.lateRate}%`} ${loan.latePeriod === 'day' ? 'ao dia' : 'ao mês (30 dias)'}` : 'Sem juros por atraso'], ['Saldo atual', money(balance.outstanding)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-medium">{value}</dd></div>)}
        </dl>
        <div className="mt-3 border-t pt-3"><p className="text-xs font-medium">Pagamentos e prorrogações</p>{receipts.length ? <ol className="mt-1 divide-y">{[...receipts].sort((a,b) => a.paidAt.localeCompare(b.paidAt)).map(receipt => <li key={receipt.id} className="space-y-1 py-2 text-xs"><div className="flex flex-wrap justify-between gap-1"><span className="font-medium">{receipt.kind === 'interest' ? 'Somente juros' : receipt.kind === 'partial' ? 'Pagamento parcial' : 'Quitação total'} · {formatBrDate(receipt.paidAt)}</span><span className="font-semibold tabular-nums">{money(receipt.amount)}</span></div><p className="text-muted-foreground">Capital pago: {money(receipt.principalPaid)} · Juros pagos: {money(receipt.interestPaid)}</p>{receipt.nextDueDate && <p className="text-muted-foreground">Vencimento prorrogado: {formatBrDate(receipt.previousDueDate)} → {formatBrDate(receipt.nextDueDate)}</p>}</li>)}</ol> : <p className="mt-1 text-xs text-muted-foreground">Nenhum pagamento registrado neste empréstimo.</p>}</div>
      </article>)}</div>
      {(history.unconfigured > 0 || history.entries.some(e => !e.registeredAt)) && <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">O histórico usa somente os dados salvos. Datas de cadastro e pagamentos antigos que não foram registrados não podem ser reconstruídos.{history.unconfigured > 0 ? ` Há ${num(history.unconfigured)} registro(s) antigo(s) sem as condições do empréstimo, fora destes totais.` : ''}</p>}
    </div>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
