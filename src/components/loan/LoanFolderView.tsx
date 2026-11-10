import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { createItem, deleteItem, updateItem } from "@/lib/storage";
import { localLoanDay, loanBalance, readLoan, stripLoan, writeLoan, type LoanTerms } from "@/lib/loans";
import { useHideBalance } from "@/hooks/useHideBalance";
import { formatBrDate } from "@/lib/format";
import { normSearch } from "@/lib/utils";
import type { Folder, Item } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { stripPaymentMarker } from "@/lib/payments";
import { stripPlanMarker } from "@/lib/planMonths";
import { stripScreensMarker } from "@/lib/itemScreens";

const cleanNotes = (notes?: string) => stripLoan(stripScreensMarker(stripPlanMarker(stripPaymentMarker(notes))));
const blank = () => ({ name: "", phone: "+55", principal: "", agreedAmount: "", lentAt: localLoanDay(), dueDate: "", lateRate: "0", latePeriod: "month" as LoanTerms["latePeriod"], notes: "" });
const decimal = (value: string) => Number(value.trim().replace(",", "."));
export function LoanFolderView({ folder }: { folder: Folder }) {
  const { data, setData } = useApp();
  const { money, phone: displayPhone } = useHideBalance();
  const [today, setToday] = useState(localLoanDay());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(blank);
  const [confirm, setConfirm] = useState<{ item: Item; action: "pay" | "delete" } | null>(null);
  useEffect(() => {
    const refresh = () => setToday(localLoanDay());
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  const rows = useMemo(() => data.items.filter(i => i.folderId === folder.id).map(item => {
    const loan = readLoan(item);
    return { item, loan, balance: loan ? loanBalance(loan, today) : null };
  }), [data.items, folder.id, today]);
  const pending = rows.filter(r => r.loan && !r.loan.paidAt);
  const visible = rows.filter(({ item, loan, balance }) =>
    (!query || normSearch(`${item.name} ${item.phone}`).includes(normSearch(query))) &&
    (filter === "all" || (filter === "paid" ? !!loan?.paidAt : filter === "late" ? !loan?.paidAt && (balance?.daysLate || 0) > 0 : !loan?.paidAt))
  ).sort((a, b) => (a.loan?.dueDate || a.item.dueDate || "").localeCompare(b.loan?.dueDate || b.item.dueDate || ""));
  const edit = (item?: Item) => {
    const loan = item && readLoan(item);
    setEditing(item || null);
    setForm(item ? { name: item.name, phone: item.phone, principal: String(loan?.principal || item.price || ""), agreedAmount: String(loan?.agreedAmount || item.price || ""), lentAt: loan?.lentAt || today, dueDate: loan?.dueDate || item.dueDate?.slice(0, 10) || "", lateRate: String(loan?.lateRate || 0), latePeriod: loan?.latePeriod || "month", notes: cleanNotes(item.notes) } : blank());
    setOpen(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!form.name.trim()) throw Error("Informe o nome do cliente.");
      const loan: LoanTerms = { version: 1, principal: Math.round(decimal(form.principal) * 100) / 100, agreedAmount: Math.round(decimal(form.agreedAmount) * 100) / 100, lentAt: form.lentAt, dueDate: form.dueDate, lateRate: decimal(form.lateRate), latePeriod: form.latePeriod };
      const notes = writeLoan(form.notes, loan);
      setData(prev => {
        const current = editing && prev.items.find(i => i.id === editing.id && i.folderId === folder.id);
        if (editing && (!current || readLoan(current)?.paidAt)) return prev;
        // Lembretes de assinaturas não se aplicam a empréstimos; o envio é manual, com saldo atualizado.
        const input = { folderId: folder.id, itemId: current?.itemId || "", name: form.name.trim(), phone: form.phone.trim(), price: loan.agreedAmount, dueDate: loan.dueDate, createdAt: current?.createdAt || `${loan.lentAt}T12:00:00`, notes, payments: [], isActive: false };
        // A alteração do vencimento de empréstimos não registra renovação de assinatura.
        if (current) {
          const next = updateItem(prev, { ...current, ...input });
          return { ...next, items: next.items.map(i => i.id === current.id ? { ...i, payments: [], notes: writeLoan(cleanNotes(i.notes), loan) } : i) };
        }
        return createItem(prev, input);
      });
      setOpen(false); toast.success(editing ? "Empréstimo atualizado" : "Empréstimo cadastrado");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira os dados."); }
  };
  const remind = (item: Item) => {
    const loan = readLoan(item);
    const phone = item.phone.replace(/\D/g, "");
    if (!phone || phone.length < 10) { toast.error("Cadastre o telefone com DDI para enviar o lembrete."); return; }
    if (!loan || loan.paidAt) return;
    const b = loanBalance(loan, localLoanDay());
    const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const message = `Olá, ${item.name}! Segue o lembrete do seu empréstimo.\n\nValor emprestado: ${brl(loan.principal)}\nValor combinado: ${brl(loan.agreedAmount)}\nVencimento: ${formatBrDate(loan.dueDate)}${b.daysLate ? `\nDias em atraso: ${b.daysLate}\nJuros de atraso: ${brl(b.lateInterest)}` : ""}\nTotal para pagamento em ${formatBrDate(localLoanDay())}: ${brl(b.total)}\n\nSe já realizou o pagamento, por favor envie o comprovante.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const confirmAction = () => {
    if (!confirm) return;
    const { item, action } = confirm;
    setData(prev => {
      const current = prev.items.find(i => i.id === item.id && i.folderId === folder.id);
      if (!current) return prev;
      if (action === "delete") return deleteItem(prev, current.id);
      const loan = readLoan(current);
      if (!loan || loan.paidAt) return prev;
      const paid = { ...loan, paidAt: new Date().toISOString(), paidAmount: loanBalance(loan, localLoanDay()).total };
      return updateItem(prev, { ...current, payments: [], notes: writeLoan(current.notes, paid) });
    });
    setConfirm(null); toast.success(action === "pay" ? "Pagamento registrado. Os juros foram encerrados." : "Empréstimo excluído");
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link><h1 className="text-2xl font-semibold">{folder.name}</h1><p className="text-sm text-muted-foreground">Empréstimos · valores e juros atualizados diariamente</p></div>
      <Button onClick={() => edit()}><Plus className="h-4 w-4" />Novo empréstimo</Button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[['Capital emprestado em aberto', pending.reduce((s, r) => s + r.loan!.principal, 0)], ['Total a receber hoje', pending.reduce((s, r) => s + r.balance!.outstanding, 0)], ['Juros de atraso em aberto', pending.reduce((s, r) => s + r.balance!.lateInterest, 0)]].map(([label, amount]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{money(Number(amount))}</p></div>)}
    </div>
    <div className="flex flex-wrap gap-2"><Input className="w-full sm:max-w-xs" aria-label="Buscar cliente ou telefone" placeholder="Buscar cliente ou telefone" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar empréstimos" className="h-10 rounded-md border bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Em aberto ({pending.length})</option><option value="late">Em atraso</option><option value="paid">Quitados</option><option value="all">Todos</option></select></div>
    {!visible.length ? <div className="rounded-xl border border-dashed p-8 text-center"><Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p>Nenhum empréstimo nesta seleção.</p><p className="text-sm text-muted-foreground">Cadastre o cliente e as condições combinadas para acompanhar.</p></div> : <ul className="grid gap-3 lg:grid-cols-2">{visible.map(({ item, loan, balance }) => <li key={item.id} className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-semibold">{item.name}</h2><p className="text-sm text-muted-foreground">{displayPhone(item.phone) || "Sem telefone"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${loan?.paidAt ? "bg-success/10 text-success" : balance?.daysLate ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{loan?.paidAt ? "Quitado" : !loan ? "Configurar" : balance?.daysLate ? `${balance.daysLate} dias em atraso` : "Em dia"}</span></div>
      {loan && balance ? <><dl className="my-4 grid grid-cols-2 gap-3 text-sm">{[['Emprestado', money(loan.principal)], ['Combinado no vencimento', money(loan.agreedAmount)], ['Data do empréstimo', formatBrDate(loan.lentAt)], ['Vencimento', formatBrDate(loan.dueDate)], ['Juros combinados', money(balance.agreedInterest)], ['Juros de atraso', money(balance.lateInterest)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{loan.paidAt ? `Pago em ${formatBrDate(loan.paidAt)}` : `Total atualizado · ${formatBrDate(today)}`}</p><p className="text-xl font-semibold">{money(balance.total)}</p><p className="mt-1 text-xs text-muted-foreground">{loan.lateRate ? `Atraso: ${loan.lateRate}% ao ${loan.latePeriod === "day" ? "dia" : "mês (30 dias)"}, juros simples.` : "Sem juros por atraso."}</p></div></> : <p className="my-4 text-sm text-muted-foreground">Registro anterior preservado. Edite para definir as condições do empréstimo.</p>}
      {cleanNotes(item.notes) ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{cleanNotes(item.notes)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">{!loan?.paidAt && <><Button size="sm" variant="outline" onClick={() => edit(item)}><Pencil className="h-4 w-4" />Editar</Button>{loan && <><Button size="sm" variant="outline" onClick={() => remind(item)}><Bell className="h-4 w-4" />Lembrete</Button><Button size="sm" onClick={() => setConfirm({ item, action: "pay" })}><CheckCircle2 className="h-4 w-4" />Registrar pagamento</Button></>}</>}<Button size="sm" variant="ghost" aria-label={`Excluir empréstimo de ${item.name}`} onClick={() => setConfirm({ item, action: "delete" })}><Trash2 className="h-4 w-4" /></Button></div>
    </li>)}</ul>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle><DialogDescription>Informe as condições combinadas com o cliente.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">{([['name', 'Nome do cliente', 'text'], ['phone', 'WhatsApp com DDI', 'tel'], ['principal', 'Valor emprestado (R$)', 'text'], ['agreedAmount', 'Valor a pagar no vencimento (R$)', 'text'], ['lentAt', 'Data do empréstimo', 'date'], ['dueDate', 'Vencimento', 'date']] as const).map(([key, label, type]) => <div key={key} className="space-y-1"><Label htmlFor={`loan-${key}`}>{label}</Label><Input id={`loan-${key}`} type={type} inputMode={key === 'principal' || key === 'agreedAmount' ? 'decimal' : undefined} required={key !== 'phone'} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>)}</div>
      <div className="rounded-lg border p-3"><p className="mb-2 text-sm font-medium">Juros após o vencimento (opcional)</p><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="loan-rate">Taxa (%)</Label><Input id="loan-rate" inputMode="decimal" required value={form.lateRate} onChange={e => setForm(p => ({ ...p, lateRate: e.target.value }))} /></div><div className="space-y-1"><Label htmlFor="loan-period">Período da taxa</Label><select id="loan-period" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={form.latePeriod} onChange={e => setForm(p => ({ ...p, latePeriod: e.target.value as LoanTerms['latePeriod'] }))}><option value="month">Ao mês (30 dias)</option><option value="day">Ao dia</option></select></div></div><p className="mt-2 text-xs text-muted-foreground">Use 0 para não cobrar juros por atraso. A contagem começa no dia seguinte ao vencimento, sobre o valor combinado, sem juros sobre juros. Taxas mensais são proporcionais aos dias de atraso.</p></div>
      <div className="space-y-1"><Label htmlFor="loan-notes">Observações</Label><Textarea id="loan-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar empréstimo</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={v => { if (!v) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>{confirm?.action === "pay" ? "Confirmar pagamento integral" : "Excluir empréstimo?"}</DialogTitle><DialogDescription>{confirm?.action === "pay" ? `Confirme somente após receber o total de ${money(loanBalance(readLoan(confirm.item)!, today).total)} de ${confirm.item.name}. A quitação congela o valor e encerra os juros.` : "O registro será removido. Esta ação não pode ser desfeita."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button><Button variant={confirm?.action === "delete" ? "destructive" : "default"} onClick={confirmAction}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
