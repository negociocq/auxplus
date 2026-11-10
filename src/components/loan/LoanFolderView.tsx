import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle2, Eye, Info, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { createItem, deleteItem, updateItem } from "@/lib/storage";
import { localLoanDay, loanBalance, loanDueStatus, readLoan, readLoanPixKey, stripLoan, writeLoan, writeLoanPixKey, type LoanTerms } from "@/lib/loans";
import { useHideBalance } from "@/hooks/useHideBalance";
import { formatBrDate } from "@/lib/format";
import { normSearch } from "@/lib/utils";
import type { Folder, Item, ItemStatus } from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { stripPaymentMarker } from "@/lib/payments";
import { stripPlanMarker } from "@/lib/planMonths";
import { stripScreensMarker } from "@/lib/itemScreens";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const cleanNotes = (notes?: string) => stripLoan(stripScreensMarker(stripPlanMarker(stripPaymentMarker(notes))));
const blank = () => ({ name: "", phone: "+55", principal: "", agreedAmount: "", lentAt: localLoanDay(), dueDate: "", lateRate: "0", latePeriod: "month" as LoanTerms["latePeriod"], notes: "" });
const decimal = (value: string) => Number(value.trim().replace(",", "."));
const dueColors: Record<ItemStatus, string> = {
  "Longe de Vencer": "border-l-success bg-[linear-gradient(90deg,hsl(var(--success)_/_0.12)_0%,hsl(var(--success)_/_0.04)_35%,transparent_70%)]",
  "Perto de Vencer": "border-l-warning bg-[linear-gradient(90deg,hsl(var(--warning)_/_0.14)_0%,hsl(var(--warning)_/_0.05)_35%,transparent_70%)]",
  "Já Vencido": "border-l-destructive bg-[linear-gradient(90deg,hsl(var(--destructive)_/_0.12)_0%,hsl(var(--destructive)_/_0.04)_35%,transparent_70%)]",
  "Sem Vencimento": "border-l-muted",
};
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const currentFolder = data.folders.find(f => f.id === folder.id) || folder;
  const pixKey = readLoanPixKey(currentFolder.whatsappMessage);
  const [pixDraft, setPixDraft] = useState(pixKey);
  const nearDays = data.folderSettings.find(s => s.folderId === folder.id)?.nearDueDays ?? 3;
  useEffect(() => { setPixDraft(pixKey); }, [folder.id, pixKey]);
  const savePix = (event: FormEvent) => {
    event.preventDefault();
    try {
      writeLoanPixKey(currentFolder.whatsappMessage, pixDraft);
      setData(prev => ({ ...prev, folders: prev.folders.map(f => f.id === folder.id ? { ...f, whatsappMessage: writeLoanPixKey(f.whatsappMessage, pixDraft) } : f) }));
      toast.success(pixDraft.trim() ? "Chave PIX salva nesta pasta" : "Chave PIX removida desta pasta");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira a chave PIX."); }
  };
  useEffect(() => {
    const refresh = () => setToday(localLoanDay());
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  const rows = useMemo(() => data.items.filter(i => i.folderId === folder.id).map(item => {
    const loan = readLoan(item);
    return { item, loan, balance: loan ? loanBalance(loan, today) : null, dueStatus: loan ? loanDueStatus(loan.dueDate, today, nearDays) : "Sem Vencimento" as ItemStatus };
  }), [data.items, folder.id, today, nearDays]);
  const pending = rows.filter(r => r.loan && !r.loan.paidAt);
  const detail = rows.find(r => r.item.id === detailId);
  const visible = rows.filter(({ item, loan, dueStatus }) =>
    (!query || normSearch(`${item.name} ${item.phone}`).includes(normSearch(query))) &&
    (filter === "all" || (filter === "paid" ? !!loan?.paidAt : !loan?.paidAt && (filter === "open" || dueStatus === (filter === "late" ? "Já Vencido" : filter === "near" ? "Perto de Vencer" : "Longe de Vencer"))))
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
    const withPix = pixKey ? `${message}\n\nChave PIX para pagamento:\n${pixKey}` : message;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(withPix)}`, "_blank", "noopener,noreferrer");
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
  return <div className="space-y-3 sm:space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link><h1 className="text-2xl font-semibold">{folder.name}</h1><p className="text-sm text-muted-foreground">Empréstimos · valores e juros atualizados diariamente</p></div>
      <Button onClick={() => edit()}><Plus className="h-4 w-4" />Novo empréstimo</Button>
    </div>
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">PIX dos lembretes <span className="ml-2 text-xs font-normal text-muted-foreground">{pixKey ? "Chave cadastrada" : "Cadastrar chave"}</span></summary>
    <form onSubmit={savePix} className="space-y-2 border-t p-4">
      <Label htmlFor="loan-folder-pix">Chave PIX desta pasta</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="loan-folder-pix" className="min-w-0 flex-1" placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória" maxLength={140} value={pixDraft} onChange={e => setPixDraft(e.target.value)} />
        <Button type="submit" variant="outline" disabled={pixDraft.trim() === pixKey}>Salvar chave PIX</Button>
      </div>
      <p className="text-xs text-muted-foreground">A chave salva será incluída nos lembretes de todos os empréstimos desta pasta. Para removê-la, apague o campo e salve.</p>
    </form>
    </details>
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      <div className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">A receber hoje</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-primary sm:text-lg">{money(pending.reduce((s, r) => s + r.balance!.outstanding, 0))}</p></div>
      <div className="min-w-0 rounded-xl border bg-card px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">Capital aberto</p><p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-lg">{money(pending.reduce((s, r) => s + r.loan!.principal, 0))}</p></div>
      <div className="min-w-0 rounded-xl border bg-card px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">Juros de atraso</p><p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-lg">{money(pending.reduce((s, r) => s + r.balance!.lateInterest, 0))}</p></div>
    </div>
    <div className="flex flex-wrap gap-2"><Input className="w-full sm:max-w-xs" aria-label="Buscar cliente ou telefone" placeholder="Buscar cliente ou telefone" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar empréstimos" className="h-10 rounded-md border bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Em aberto ({pending.length})</option><option value="far">Longe do vencimento</option><option value="near">Perto do vencimento</option><option value="late">Em atraso</option><option value="paid">Quitados</option><option value="all">Todos</option></select></div>
    {!visible.length ? <div className="rounded-xl border border-dashed p-8 text-center"><Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p>Nenhum empréstimo nesta seleção.</p><p className="text-sm text-muted-foreground">Cadastre o cliente e as condições combinadas para acompanhar.</p></div> : <ul className="grid gap-3 lg:grid-cols-2">{visible.map(({ item, loan, balance, dueStatus }) => <li key={item.id} className={`min-w-0 overflow-hidden rounded-xl border border-l-4 bg-card ${loan && !loan.paidAt ? dueColors[dueStatus] : "border-l-muted"}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold leading-snug">{item.name}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{displayPhone(item.phone) || "Sem telefone"}</p></div>
          <div className="flex shrink-0 items-center gap-1">{loan && !loan.paidAt ? <StatusBadge status={dueStatus} /> : <span className="rounded-full bg-muted px-2 py-1 text-xs">{loan?.paidAt ? "Quitado" : "Configurar"}</span>}{!loan?.paidAt && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full" aria-label="Editar" title="Editar empréstimo" onClick={() => edit(item)}><Pencil className="h-3.5 w-3.5" /></Button>}</div>
        </div>
      {loan && balance ? (
        <div className="mt-2.5 space-y-2">
          <dl className="grid grid-cols-3 divide-x divide-foreground/10 border-y border-foreground/10 py-2">
            <div className="min-w-0 pr-2"><dt className="text-[10px] text-muted-foreground">Emprestado</dt><dd className="mt-0.5 break-words text-xs font-medium tabular-nums min-[360px]:text-sm">{money(loan.principal)}</dd></div>
            <div className="min-w-0 px-2"><dt className="text-[10px] text-muted-foreground">Juros totais</dt><dd className="mt-0.5 break-words text-xs font-medium tabular-nums min-[360px]:text-sm">{money(balance.agreedInterest + balance.lateInterest)}</dd></div>
            <div className="min-w-0 pl-2 text-right"><dt className="text-[10px] text-muted-foreground">{loan.paidAt ? "Pago" : "Total a pagar"}</dt><dd className="mt-0.5 break-words text-xs font-bold tabular-nums text-primary min-[360px]:text-sm">{money(balance.total)}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <p>{loan.lateRate ? `Taxa de atraso: ${loan.lateRate}% ${loan.latePeriod === "day" ? "ao dia" : "ao mês (30 dias)"}` : "Sem juros por atraso"}</p>
            <p>Vence: <span className="font-medium text-foreground">{formatBrDate(loan.dueDate)}</span></p>
          </div>
        </div>
      ) : <p className="my-3 text-sm text-muted-foreground">Configure as condições do empréstimo.</p>}

      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-foreground/10 bg-background/40 px-3 py-2"><Button type="button" variant="outline" className={`h-9 gap-1.5 text-xs ${!loan || loan.paidAt ? "col-span-2" : ""}`} onClick={() => setDetailId(item.id)}><Eye className="h-4 w-4" />Detalhes</Button>{loan && !loan.paidAt && <Button type="button" className="h-9 gap-1.5 text-xs" onClick={() => remind(item)}><Bell className="h-4 w-4" />Lembrete</Button>}</div>
    </li>)}</ul>}
    <Dialog open={!!detail} onOpenChange={value => { if (!value) setDetailId(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Detalhes do empréstimo</DialogTitle><DialogDescription>{detail?.item.name}</DialogDescription></DialogHeader>
        {detail ? (() => {
          const { item, loan, balance, dueStatus } = detail;
          return <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{displayPhone(item.phone) || "Sem telefone"}</p>{loan && !loan.paidAt ? <StatusBadge status={dueStatus} /> : <span className="text-sm">{loan?.paidAt ? "Quitado" : "Configurar"}</span>}</div>
      {loan && balance ? <><dl className="my-4 grid grid-cols-2 gap-3 text-sm">{[['Emprestado', money(loan.principal)], ['Combinado no vencimento', money(loan.agreedAmount)], ['Data do empréstimo', formatBrDate(loan.lentAt)], ['Vencimento', formatBrDate(loan.dueDate)], ['Juros combinados', money(balance.agreedInterest)], ['Juros de atraso', money(balance.lateInterest)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{loan.paidAt ? `Pago em ${formatBrDate(loan.paidAt)}` : `Total atualizado · ${formatBrDate(today)}`}</p><p className="text-xl font-semibold">{money(balance.total)}</p><p className="mt-1 text-xs text-muted-foreground">{loan.lateRate ? `Atraso: ${loan.lateRate}% ao ${loan.latePeriod === "day" ? "dia" : "mês (30 dias)"}, juros simples.` : "Sem juros por atraso."}</p></div></> : <p className="my-4 text-sm text-muted-foreground">Registro anterior preservado. Edite para definir as condições do empréstimo.</p>}
      {cleanNotes(item.notes) ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{cleanNotes(item.notes)}</p> : null}
            {loan && !loan.paidAt && balance?.daysLate ? <p className="text-sm text-destructive">{balance.daysLate} dias em atraso</p> : null}
            <div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="outline" onClick={() => setDetailId(null)}>Fechar</Button></div>
      <div className="mt-4 flex flex-wrap gap-2">{!loan?.paidAt && <><Button size="sm" variant="outline" onClick={() => { setDetailId(null); edit(item); }}><Pencil className="h-4 w-4" />Editar</Button>{loan && <><Button size="sm" variant="outline" onClick={() => remind(item)}><Bell className="h-4 w-4" />Lembrete</Button><Button size="sm" onClick={() => { setDetailId(null); setConfirm({ item, action: "pay" }); }}><CheckCircle2 className="h-4 w-4" />Registrar pagamento</Button></>}</>}<Button size="sm" variant="ghost" aria-label={`Excluir empréstimo de ${item.name}`} onClick={() => { setDetailId(null); setConfirm({ item, action: "delete" }); }}><Trash2 className="h-4 w-4" /></Button></div>
          </div>;
        })() : null}
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle><DialogDescription>Informe as condições combinadas com o cliente.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">{([['name', 'Nome do cliente', 'text'], ['phone', 'WhatsApp com DDI', 'tel'], ['principal', 'Valor emprestado (R$)', 'text'], ['agreedAmount', 'Valor a pagar no vencimento (R$)', 'text'], ['lentAt', 'Data do empréstimo', 'date'], ['dueDate', 'Vencimento', 'date']] as const).map(([key, label, type]) => <div key={key} className="space-y-1"><Label htmlFor={`loan-${key}`}>{label}</Label><Input id={`loan-${key}`} type={type} inputMode={key === 'principal' || key === 'agreedAmount' ? 'decimal' : undefined} required={key !== 'phone'} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>)}</div>
      <div className="rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">Juros após o vencimento (opcional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="loan-rate">Taxa (%)</Label>
            <Input id="loan-rate" inputMode="decimal" required value={form.lateRate} onChange={e => setForm(p => ({ ...p, lateRate: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="loan-period">Período da taxa</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="Como funcionam os juros ao mês e ao dia" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 text-sm">
                  <p className="font-semibold">Como escolher o período?</p>
                  <p><strong>Ao mês:</strong> a taxa informada vale para 30 dias de atraso. O sistema divide esse valor por 30 para calcular cada dia.</p>
                  <p>Exemplo: valor combinado de <strong>R$ 1.000</strong>, com <strong>3% ao mês</strong>, gera R$ 30 em 30 dias — ou <strong>R$ 1 por dia de atraso</strong>. Em 5 dias, o total será R$ 1.005.</p>
                  <p><strong>Ao dia:</strong> a taxa informada é cobrada a cada dia de atraso.</p>
                  <p>Exemplo: valor combinado de <strong>R$ 1.000</strong>, com <strong>1% ao dia</strong>, gera <strong>R$ 10 por dia de atraso</strong>. Em 5 dias, o total será R$ 1.050.</p>
                  <p className="border-t pt-2 text-xs text-muted-foreground">Os juros começam no dia seguinte ao vencimento e são calculados sempre sobre o valor combinado, sem cobrar juros sobre os juros acumulados. Com taxa 0, o valor não aumenta após vencer.</p>
                </PopoverContent>
              </Popover>
            </div>
            <select id="loan-period" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={form.latePeriod} onChange={e => setForm(p => ({ ...p, latePeriod: e.target.value as LoanTerms['latePeriod'] }))}><option value="month">Ao mês (30 dias)</option><option value="day">Ao dia</option></select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Use 0 para não cobrar juros por atraso. Toque no ícone de informação para ver exemplos.</p>
      </div>
      <div className="space-y-1"><Label htmlFor="loan-notes">Observações</Label><Textarea id="loan-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar empréstimo</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={v => { if (!v) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>{confirm?.action === "pay" ? "Confirmar pagamento integral" : "Excluir empréstimo?"}</DialogTitle><DialogDescription>{confirm?.action === "pay" ? `Confirme somente após receber o total de ${money(loanBalance(readLoan(confirm.item)!, today).total)} de ${confirm.item.name}. A quitação congela o valor e encerra os juros.` : "O registro será removido. Esta ação não pode ser desfeita."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button><Button variant={confirm?.action === "delete" ? "destructive" : "default"} onClick={confirmAction}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
