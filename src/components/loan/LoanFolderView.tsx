import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCircle2, Eye, History, Info, MessageSquareText, Pencil, Plus, Trash2, Wallet } from "lucide-react";
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
import { readLoanReminder, renderLoanReminder, writeLoanReminder } from "@/lib/loans";
import { readLoanAutoSettings, writeLoanAutoSettings, buildLoanReminderMessage } from "@/lib/loans";
import { defaultLoanReminder, loanReminderKind, type LoanReminderKind } from "@/lib/loans";
import { dailyLoanRate, nextLoanMonth, recordLoanPayment } from "@/lib/loans";
import { LoanClientHistory } from "@/components/loan/LoanClientHistory";
import { LoanWhatsappConnection } from "@/components/loan/LoanWhatsappConnection";
import { useLoanWhatsappConnection } from "@/hooks/useLoanWhatsappConnection";
import { fetchEvolutionStatus, sendEvolutionText } from "@/lib/whatsappAutomation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const cleanNotes = (notes?: string) => stripLoan(stripScreensMarker(stripPlanMarker(stripPaymentMarker(notes))));
const blank = () => ({ name: "", phone: "+55", principal: "", agreedAmount: "", lentAt: localLoanDay(), dueDate: "", lateRate: "0", lateRateType: "percent" as NonNullable<LoanTerms["lateRateType"]>, latePeriod: "day" as LoanTerms["latePeriod"], notes: "" });
const decimal = (value: string) => Number(value.trim().replace(",", "."));
const loanFinancialFields = ["principal", "agreedAmount", "lentAt", "dueDate", "lateRate", "latePeriod", "lateRateType"] as const;
const sameLoanConditions = (a: LoanTerms, b: LoanTerms) => dailyLoanRate(a) === dailyLoanRate(b) && loanFinancialFields.filter(key => key !== "lateRate" && key !== "latePeriod").every(key => (a[key] ?? (key === "lateRateType" ? "percent" : undefined)) === (b[key] ?? (key === "lateRateType" ? "percent" : undefined)));
const dueColors: Record<ItemStatus, string> = {
  "Longe de Vencer": "border-l-success bg-[linear-gradient(90deg,hsl(var(--success)_/_0.12)_0%,hsl(var(--success)_/_0.04)_35%,transparent_70%)]",
  "Perto de Vencer": "border-l-warning bg-[linear-gradient(90deg,hsl(var(--warning)_/_0.14)_0%,hsl(var(--warning)_/_0.05)_35%,transparent_70%)]",
  "Já Vencido": "border-l-destructive bg-[linear-gradient(90deg,hsl(var(--destructive)_/_0.12)_0%,hsl(var(--destructive)_/_0.04)_35%,transparent_70%)]",
  "Sem Vencimento": "border-l-muted",
};
export function LoanFolderView({ folder }: { folder: Folder }) {
  const { data, setData, user } = useApp();
  const loanWa = useLoanWhatsappConnection(user?.id, folder.id);
  const [manualReminder, setManualReminder] = useState<{ itemId: string; instance: string; phone: string; text: string; snapshot: string } | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const sendingReminderRef = useRef(false);
  useEffect(() => { setManualReminder(null); }, [folder.id]);
  const { money, phone: displayPhone } = useHideBalance();
  const [today, setToday] = useState(localLoanDay());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(blank);
  const [confirm, setConfirm] = useState<{ item: Item; action: "pay" | "interest" | "delete"; receiptId?: string; snapshot?: string; nextDueDate?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const historyFolders = useMemo(() => data.folders.filter(f => f.userId === folder.userId && f.type === "Produto"), [data.folders, folder.userId]);
  const currentFolder = data.folders.find(f => f.id === folder.id) || folder;
  const pixKey = readLoanPixKey(currentFolder.whatsappMessage);
  const [pixDraft, setPixDraft] = useState(pixKey);
  const reminderTemplate = readLoanReminder(currentFolder.whatsappMessage);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageKind, setMessageKind] = useState<LoanReminderKind>("before");
  const [messageDrafts, setMessageDrafts] = useState({ before: readLoanReminder(currentFolder.whatsappMessage, "before"), onday: readLoanReminder(currentFolder.whatsappMessage, "onday") });
  const messageDraft = messageDrafts[messageKind];
  const messagePreviewDue = messageKind === "before" ? new Date(Date.parse(`${today}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10) : today;
  const setMessageDraft = (value: string | ((previous: string) => string)) => setMessageDrafts(previous => ({ ...previous, [messageKind]: typeof value === "function" ? value(previous[messageKind]) : value }));
  const autoSettings = readLoanAutoSettings(currentFolder.whatsappMessage);
  const [autoDraft, setAutoDraft] = useState(autoSettings);
  useEffect(() => { setAutoDraft(readLoanAutoSettings(currentFolder.whatsappMessage)); }, [folder.id, currentFolder.whatsappMessage]);
  const saveAuto = (event: FormEvent) => {
    event.preventDefault();
    try {
      writeLoanAutoSettings(currentFolder.whatsappMessage, autoDraft);
      setData(prev => ({ ...prev, folders: prev.folders.map(f => f.id === folder.id ? { ...f, whatsappMessage: writeLoanAutoSettings(f.whatsappMessage, autoDraft) } : f) }));
      toast.success(autoDraft.enabled ? loanWa.status === "open" ? "Envio automático agendado nesta pasta" : "Agendamento salvo. Conecte o WhatsApp desta pasta para enviar." : "Envio automático desligado nesta pasta");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira o horário."); }
  };
  const saveMessage = (event: FormEvent) => {
    event.preventDefault();
    try {
      const writeBoth = (message?: string | null) => writeLoanReminder(writeLoanReminder(message, messageDrafts.before, "before"), messageDrafts.onday, "onday");
      writeBoth(currentFolder.whatsappMessage);
      setData(prev => ({ ...prev, folders: prev.folders.map(f => f.id === folder.id ? { ...f, whatsappMessage: writeBoth(f.whatsappMessage) } : f) }));
      setMessageOpen(false);
      toast.success("Mensagens dos lembretes salvas nesta pasta");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Confira a mensagem."); }
  };
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
  const dueToday = pending.filter(r => r.loan!.dueDate === today);
  const detail = rows.find(r => r.item.id === detailId);
  const paymentLoan = confirm && confirm.action !== "delete" ? readLoan(confirm.item) : null;
  const paymentBalance = paymentLoan ? loanBalance(paymentLoan, today) : null;
  const visible = rows.filter(({ item, loan, dueStatus }) =>
    (!query || normSearch(`${item.name} ${item.phone}`).includes(normSearch(query))) &&
    (filter === "all" || (filter === "paid" ? !!loan?.paidAt : !loan?.paidAt && (filter === "open" || dueStatus === (filter === "late" ? "Já Vencido" : filter === "near" ? "Perto de Vencer" : "Longe de Vencer"))))
  ).sort((a, b) => (a.loan?.dueDate || a.item.dueDate || "").localeCompare(b.loan?.dueDate || b.item.dueDate || ""));
  const edit = (item?: Item) => {
    const loan = item && readLoan(item);
    setEditing(item || null);
    setForm(item ? { name: item.name, phone: item.phone, principal: String(loan?.principal || item.price || ""), agreedAmount: String(loan?.agreedAmount || item.price || ""), lentAt: loan?.lentAt || today, dueDate: loan?.dueDate || item.dueDate?.slice(0, 10) || "", lateRate: String(loan ? dailyLoanRate(loan) : 0), lateRateType: loan?.lateRateType || "percent", latePeriod: "day", notes: cleanNotes(item.notes) } : blank());
    setOpen(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!form.name.trim()) throw Error("Informe o nome do cliente.");
      const loan: LoanTerms = { version: 1, principal: Math.round(decimal(form.principal) * 100) / 100, agreedAmount: Math.round(decimal(form.agreedAmount) * 100) / 100, lentAt: form.lentAt, dueDate: form.dueDate, lateRate: decimal(form.lateRate), lateRateType: form.lateRateType, latePeriod: form.latePeriod, ...(!editing ? { registeredAt: new Date().toISOString(), initialDueDate: form.dueDate } : {}) };
      const oldLoan = editing && readLoan(data.items.find(i => i.id === editing.id) || editing);
      if (oldLoan?.balanceState && !sameLoanConditions(oldLoan, loan)) throw Error("Após pagamento parcial, mantenha as condições financeiras. Você pode editar nome, telefone e observações.");
      const notes = writeLoan(form.notes, loan);
      setData(prev => {
        const current = editing && prev.items.find(i => i.id === editing.id && i.folderId === folder.id);
        if (editing && (!current || readLoan(current)?.paidAt)) return prev;
        // Lembretes de assinaturas não se aplicam a empréstimos; o envio é manual, com saldo atualizado.
        const input = { folderId: folder.id, itemId: current?.itemId || "", name: form.name.trim(), phone: form.phone.trim(), price: loan.agreedAmount, dueDate: loan.dueDate, createdAt: current?.createdAt || new Date().toISOString(), notes, payments: [], isActive: false };
        // A alteração do vencimento de empréstimos não registra renovação de assinatura.
        if (current) {
          const previousLoan = readLoan(current);
          if (previousLoan?.balanceState && !sameLoanConditions(previousLoan, loan)) return prev;
          const next = updateItem(prev, { ...current, ...input });
          const preservedLoan = { ...previousLoan, ...loan, ...(previousLoan && dailyLoanRate(previousLoan) === dailyLoanRate(loan) ? { lateRate: previousLoan.lateRate, latePeriod: previousLoan.latePeriod } : {}), ...(previousLoan?.dueDate !== loan.dueDate ? { cycleDay: Number(loan.dueDate.slice(8, 10)) } : {}) };
          return { ...next, items: next.items.map(i => i.id === current.id ? { ...i, payments: [], notes: writeLoan(cleanNotes(i.notes), preservedLoan) } : i) };
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
    if (!loanWa.runtime || loanWa.status !== "open") { toast.error("Conecte o WhatsApp de empréstimos desta pasta antes de enviar o lembrete."); return; }
    const kind = loanReminderKind(loan, localLoanDay());
    const withPix = buildLoanReminderMessage(kind ? readLoanReminder(currentFolder.whatsappMessage, kind) : reminderTemplate, item.name, loan, localLoanDay(), pixKey);
    setDetailId(null);
    setManualReminder({ itemId: item.id, instance: loanWa.runtime.instanceName, phone, text: withPix, snapshot: JSON.stringify(loan) });
  };
  const sendManualReminder = async () => {
    if (sendingReminderRef.current || !manualReminder || !loanWa.runtime) return;
    const currentItem = data.items.find(item => item.id === manualReminder.itemId && item.folderId === folder.id);
    const loan = readLoan(currentItem || {});
    if (!loan || loan.paidAt || currentItem?.phone.replace(/\D/g, "") !== manualReminder.phone || JSON.stringify(loan) !== manualReminder.snapshot || manualReminder.instance !== loanWa.runtime.instanceName) { toast.error("Os dados ou a conexão mudaram. Abra o lembrete novamente para conferir."); setManualReminder(null); return; }
    sendingReminderRef.current = true; setSendingReminder(true);
    try {
      if (await fetchEvolutionStatus(loanWa.runtime) !== "open") throw Error("O WhatsApp desta pasta está desconectado.");
      await sendEvolutionText(loanWa.runtime, manualReminder.phone, manualReminder.text, 0);
      setManualReminder(null); toast.success("Lembrete enviado pelo WhatsApp desta pasta");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o envio. Confira o WhatsApp antes de tentar novamente."); }
    finally { sendingReminderRef.current = false; setSendingReminder(false); }
  };
  const openPayment = (item: Item, action: "pay" | "interest") => {
    const loan = readLoan(item);
    if (!loan || loan.paidAt) return;
    setDetailId(null);
    setConfirm({ item, action, receiptId: crypto.randomUUID(), snapshot: JSON.stringify(loan), ...(action === "interest" ? { nextDueDate: nextLoanMonth(loan.dueDate, loan.cycleDay) } : {}) });
  };
  const confirmAction = () => {
    if (!confirm) return;
    const { item, action } = confirm;
    const currentItem = data.items.find(i => i.id === item.id && i.folderId === folder.id);
    const currentLoan = currentItem && readLoan(currentItem);
    let paid: LoanTerms | null = null;
    if (action !== "delete") {
      if (!currentLoan || JSON.stringify(currentLoan) !== confirm.snapshot) { toast.error("Os dados do empréstimo mudaram. Abra os detalhes novamente para conferir."); setConfirm(null); return; }
      try { paid = recordLoanPayment(currentLoan, { id: confirm.receiptId!, kind: action === "interest" ? "interest" : "full", paidAt: new Date().toISOString(), nextDueDate: confirm.nextDueDate }); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Confira o pagamento."); return; }
    }
    setData(prev => {
      const current = prev.items.find(i => i.id === item.id && i.folderId === folder.id);
      if (!current) return prev;
      if (action === "delete") return deleteItem(prev, current.id);
      const loan = readLoan(current);
      if (!loan || loan.paidAt || JSON.stringify(loan) !== confirm.snapshot || !paid) return prev;
      const next = updateItem(prev, { ...current, dueDate: paid.dueDate, payments: [], notes: writeLoan(current.notes, paid) });
      return { ...next, items: next.items.map(i => i.id === current.id ? { ...i, payments: [], notes: writeLoan(cleanNotes(i.notes), paid!) } : i) };
    });
    setConfirm(null); toast.success(action === "pay" ? "Empréstimo quitado. Os juros foram encerrados." : action === "interest" ? "Juros recebidos. Capital mantido e vencimento prorrogado." : "Empréstimo excluído");
  };
  return <div className="space-y-3 sm:space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link><h1 className="text-2xl font-semibold">{folder.name}</h1><p className="text-sm text-muted-foreground">Empréstimos · valores e juros atualizados diariamente</p></div>
      <Button onClick={() => edit()}><Plus className="h-4 w-4" />Novo empréstimo</Button>
    </div>
    <LoanWhatsappConnection connection={loanWa} />
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{autoSettings.enabled ? `Automático: ${autoSettings.sendBefore && autoSettings.sendOnDay ? "2 dias antes e no vencimento" : autoSettings.sendBefore ? "somente 2 dias antes" : "somente no vencimento"} · ${autoSettings.sendTime}` : "Envio automático desligado"}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => { setMessageDrafts({ before: readLoanReminder(currentFolder.whatsappMessage, "before"), onday: readLoanReminder(currentFolder.whatsappMessage, "onday") }); setMessageKind("before"); setMessageOpen(true); }}><MessageSquareText className="h-4 w-4" />Editar lembrete</Button>
    </div>
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Envio automático <span className="ml-2 text-xs font-normal text-muted-foreground">{autoSettings.enabled ? "Ativo" : "Configurar"}</span></summary>
      <form className="space-y-3 border-t p-4" onSubmit={saveAuto}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={autoDraft.sendBefore} onChange={e => setAutoDraft(s => ({ ...s, sendBefore: e.target.checked, enabled: e.target.checked || s.sendOnDay }))} />Enviar 2 dias antes</label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={autoDraft.sendOnDay} onChange={e => setAutoDraft(s => ({ ...s, sendOnDay: e.target.checked, enabled: s.sendBefore || e.target.checked }))} />Enviar no vencimento</label>
        </div>
        <p className="text-xs text-muted-foreground">Marque uma opção ou as duas. Desmarque ambas para desligar os envios automáticos desta pasta.</p>
        <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="loan-auto-time">Horário de Brasília</Label><Input id="loan-auto-time" type="time" required value={autoDraft.sendTime} onChange={e => setAutoDraft(s => ({ ...s, sendTime: e.target.value }))} /></div><Button type="submit">Salvar agendamento</Button></div>
        <p className="text-xs text-muted-foreground">Usa a mensagem e a chave PIX desta pasta. Funciona com o AuxPlus fechado e exige o WhatsApp de empréstimos conectado aqui. A fila é conferida a cada 5 minutos após o horário escolhido. Empréstimos quitados não recebem cobrança.</p>
      </form>
    </details>
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      <div className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">Total a receber</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-primary sm:text-lg">{money(pending.reduce((s, r) => s + r.balance!.outstanding, 0))}</p></div>
      <div className="min-w-0 rounded-xl border bg-card px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">Vence hoje</p><p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-lg">{money(dueToday.reduce((s, r) => s + r.balance!.outstanding, 0))}</p></div>
      <div className="min-w-0 rounded-xl border bg-card px-2.5 py-2.5 sm:px-4"><p className="text-[11px] leading-tight text-muted-foreground">Juros de atraso</p><p className="mt-1 break-words text-sm font-semibold tabular-nums sm:text-lg">{money(pending.reduce((s, r) => s + r.balance!.lateInterest, 0))}</p></div>
    </div>
    <div className="flex flex-wrap gap-2"><Input className="w-full sm:max-w-xs" aria-label="Buscar cliente ou telefone" placeholder="Buscar cliente ou telefone" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar empréstimos" className="h-10 rounded-md border bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Em aberto ({pending.length})</option><option value="far">Longe do vencimento</option><option value="near">Perto do vencimento</option><option value="late">Em atraso</option><option value="paid">Quitados</option><option value="all">Todos</option></select></div>
    {!visible.length ? <div className="rounded-xl border border-dashed p-8 text-center"><Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p>Nenhum empréstimo nesta seleção.</p><p className="text-sm text-muted-foreground">Cadastre o cliente e as condições combinadas para acompanhar.</p></div> : <ul className="grid gap-3 lg:grid-cols-2">{visible.map(({ item, loan, balance, dueStatus }) => <li key={item.id} className={`min-w-0 overflow-hidden rounded-xl border border-l-4 bg-card ${loan && !loan.paidAt ? dueColors[dueStatus] : "border-l-muted"}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold leading-snug">{item.name}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{displayPhone(item.phone) || "Sem telefone"}</p></div>
          <div className="flex shrink-0 items-center gap-1">{loan && !loan.paidAt ? <StatusBadge status={dueStatus} /> : <span className="rounded-full bg-muted px-2 py-1 text-xs">{loan?.paidAt ? "Quitado" : "Configurar"}</span>}{!loan?.paidAt && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full" aria-label="Editar" title="Editar empréstimo" onClick={() => edit(item)}><Pencil className="h-3.5 w-3.5" /></Button>}<Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full text-destructive hover:text-destructive" aria-label={`Excluir empréstimo de ${item.name}`} title="Excluir empréstimo" onClick={() => setConfirm({ item, action: "delete" })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
        </div>
      {loan && balance ? (
        <div className="mt-2.5 space-y-2">
          <dl className="grid grid-cols-3 divide-x divide-foreground/10 border-y border-foreground/10 py-2">
            <div className="min-w-0 pr-2"><dt className="text-[10px] text-muted-foreground">Emprestado</dt><dd className="mt-0.5 break-words text-xs font-medium tabular-nums min-[360px]:text-sm">{money(loan.principal)}</dd></div>
            <div className="min-w-0 px-2"><dt className="text-[10px] text-muted-foreground">Juros totais</dt><dd className="mt-0.5 break-words text-xs font-medium tabular-nums min-[360px]:text-sm">{money(balance.agreedInterest + balance.lateInterest)}</dd></div>
            <div className="min-w-0 pl-2 text-right"><dt className="text-[10px] text-muted-foreground">{loan.paidAt ? "Pago" : "Total a pagar"}</dt><dd className="mt-0.5 break-words text-xs font-bold tabular-nums text-primary min-[360px]:text-sm">{money(balance.total)}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <p>{loan.lateRate ? `Taxa de atraso: ${loan.lateRateType === "amount" ? money(dailyLoanRate(loan)) : `${Number(dailyLoanRate(loan).toFixed(8))}%`} ao dia` : "Sem juros por atraso"}</p>
            <p>{!loan.paidAt && balance.daysLate > 0 ? <><span className="font-medium text-destructive">Vencido há {balance.daysLate} {balance.daysLate === 1 ? "dia" : "dias"}</span><span> · </span></> : "Vence: "}<span className="font-medium text-foreground">{formatBrDate(loan.dueDate)}</span></p>
          </div>
        </div>
      ) : <p className="my-3 text-sm text-muted-foreground">Configure as condições do empréstimo.</p>}

      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-foreground/10 bg-background/40 px-3 py-2"><Button type="button" variant="outline" className={`h-9 gap-1.5 text-xs ${!loan || loan.paidAt ? "col-span-2" : ""}`} onClick={() => setDetailId(item.id)}><Eye className="h-4 w-4" />Detalhes</Button>{loan && !loan.paidAt && <Button type="button" className="h-9 gap-1.5 text-xs" onClick={() => remind(item)}><Bell className="h-4 w-4" />Lembrete</Button>}</div>
    </li>)}</ul>}
    <Dialog open={!!manualReminder} onOpenChange={open => { if (!open && !sendingReminder) setManualReminder(null); }}><DialogContent><DialogHeader><DialogTitle>Enviar lembrete</DialogTitle><DialogDescription>Será enviado pelo WhatsApp desta pasta{loanWa.connectedProfile?.phone ? ` (${displayPhone(loanWa.connectedProfile.phone)})` : ""} para {displayPhone(manualReminder?.phone)}.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="loan-manual-reminder">Confira a mensagem</Label><Textarea id="loan-manual-reminder" className="min-h-52" value={manualReminder?.text || ""} disabled={sendingReminder} onChange={e => setManualReminder(value => value ? { ...value, text: e.target.value } : null)} /></div><DialogFooter><Button variant="outline" disabled={sendingReminder} onClick={() => setManualReminder(null)}>Cancelar</Button><Button disabled={sendingReminder || !manualReminder?.text.trim()} onClick={() => void sendManualReminder()}>{sendingReminder ? "Enviando…" : "Enviar lembrete"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mensagens dos lembretes</DialogTitle><DialogDescription>Edite cada etapa separadamente. O agendamento usa o texto de 2 dias antes e, no vencimento, o texto do próprio dia.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={saveMessage}>
          <Tabs value={messageKind} onValueChange={value => setMessageKind(value as LoanReminderKind)}><TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger className="whitespace-normal text-xs" value="before">2 dias antes</TabsTrigger><TabsTrigger className="whitespace-normal text-xs" value="onday">No vencimento</TabsTrigger></TabsList></Tabs>
          <div className="space-y-2"><Label htmlFor="loan-reminder-message">Mensagem — {messageKind === "before" ? "2 dias antes" : "no vencimento"}</Label><Textarea id="loan-reminder-message" className="min-h-44" maxLength={4000} required value={messageDraft} onChange={e => setMessageDraft(e.target.value)} /></div>
          <div className="flex flex-wrap gap-1.5">{[['name', 'Nome'], ['principal', 'Emprestado'], ['agreed_amount', 'Valor combinado'], ['due_date', 'Vencimento'], ['late_days', 'Dias em atraso'], ['late_interest', 'Juros de atraso'], ['total', 'Total atualizado'], ['today', 'Data atual'], ['pix', 'Chave PIX']].map(([key, label]) => <Button key={key} type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => setMessageDraft(text => `${text}${text && !/\s$/.test(text) ? ' ' : ''}{${key}}`.slice(0, 4000))}>{label}</Button>)}</div>
          <p className="text-xs text-muted-foreground">Toque em um campo acima para inseri-lo no texto. Os valores são preenchidos ao abrir o lembrete. Se houver uma chave PIX cadastrada, ela será incluída mesmo sem o campo {'{pix}'}.</p>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Prévia com dados de exemplo</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{renderLoanReminder(messageDraft, { name: 'Cliente exemplo', principal: 'R$ 200,00', agreed_amount: 'R$ 500,00', due_date: formatBrDate(messagePreviewDue), late_days: '0', late_interest: 'R$ 0,00', total: 'R$ 500,00', today: formatBrDate(today) }, 'chave-pix-exemplo')}</p></details>
          <Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={() => setMessageDraft(defaultLoanReminder(messageKind))}>Usar padrão desta etapa</Button>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMessageOpen(false)}>Cancelar</Button><Button type="submit" disabled={!messageDrafts.before.trim() || !messageDrafts.onday.trim()}>Salvar mensagens</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!detail} onOpenChange={value => { if (!value) setDetailId(null); }}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] [&>div]:shrink-0 sm:max-w-lg sm:p-6">
        <DialogHeader className="pr-8 text-left"><DialogTitle>Detalhes do empréstimo</DialogTitle><DialogDescription>{detail?.item.name}</DialogDescription></DialogHeader>
        {detail ? (() => {
          const { item, loan, balance, dueStatus } = detail;
          return <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{displayPhone(item.phone) || "Sem telefone"}</p>{loan && !loan.paidAt ? <StatusBadge status={dueStatus} /> : <span className="text-sm">{loan?.paidAt ? "Quitado" : "Configurar"}</span>}</div>
      {loan && balance ? <><dl className="my-4 grid grid-cols-2 gap-3 text-sm">{[['Emprestado', money(loan.principal)], ['Combinado no vencimento', money(loan.agreedAmount)], ['Data do empréstimo', formatBrDate(loan.lentAt)], ['Vencimento', formatBrDate(loan.dueDate)], ['Juros combinados', money(balance.agreedInterest)], ['Juros de atraso', money(balance.lateInterest)], ['Capital restante', money(balance.principalRemaining)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl><div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{loan.paidAt ? `Pago em ${formatBrDate(loan.paidAt)}` : `Total atualizado · ${formatBrDate(today)}`}</p><p className="text-xl font-semibold">{money(balance.total)}</p><p className="mt-1 text-xs text-muted-foreground">{loan.lateRate ? `Atraso: ${loan.lateRateType === "amount" ? money(dailyLoanRate(loan)) : `${Number(dailyLoanRate(loan).toFixed(8))}%`} ao dia, juros simples.` : "Sem juros por atraso."}</p></div></> : <p className="my-4 text-sm text-muted-foreground">Registro anterior preservado. Edite para definir as condições do empréstimo.</p>}
      {cleanNotes(item.notes) ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{cleanNotes(item.notes)}</p> : null}
            {!!loan?.receipts?.length && <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Histórico de pagamentos ({loan.receipts.length})</summary>
              <p className="mt-2 text-xs text-muted-foreground">Total recebido: {money(loan.receipts.reduce((sum, receipt) => sum + receipt.amount, 0))}</p>
              <ul className="mt-2 divide-y">{[...loan.receipts].reverse().map(receipt => <li key={receipt.id} className="space-y-1 py-2 text-xs">
                <div className="flex justify-between gap-2"><span className="font-medium">{receipt.kind === "interest" ? "Somente juros" : receipt.kind === "partial" ? "Pagamento parcial" : "Quitação total"}</span><span className="font-semibold tabular-nums">{money(receipt.amount)}</span></div>
                <p className="text-muted-foreground">{formatBrDate(receipt.paidAt)} · Capital pago: {money(receipt.principalPaid)} · Juros: {money(receipt.interestPaid)}</p>
                {receipt.nextDueDate && <p className="text-muted-foreground">Vencimento prorrogado de {formatBrDate(receipt.previousDueDate)} para {formatBrDate(receipt.nextDueDate)}</p>}
              </li>)}</ul>
            </details>}
            {loan && !loan.paidAt && balance?.daysLate ? <p className="text-sm text-destructive">{balance.daysLate} dias em atraso</p> : null}
            <div className="space-y-2 border-t pt-3">
              <Button variant="outline" className="h-10 w-full" onClick={() => { setDetailId(null); setHistoryId(item.id); }}><History className="h-4 w-4" />Histórico do cliente</Button>
              {loan && balance && !loan.paidAt && <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-auto min-h-14 min-w-0 flex-col gap-0.5 px-2 py-2 text-xs" disabled={balance.total <= balance.principalRemaining} onClick={() => openPayment(item, "interest")}><span>Somente juros</span><span className="font-semibold tabular-nums">{money(balance.total - balance.principalRemaining)}</span></Button>
                <Button className="h-auto min-h-14 min-w-0 flex-col gap-0.5 px-2 py-2 text-xs" onClick={() => openPayment(item, "pay")}><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Quitar tudo</span><span className="font-semibold tabular-nums">{money(balance.total)}</span></Button>
              </div>}
              <div className="grid grid-cols-2 gap-2">
                {!loan?.paidAt && <Button className="h-10 w-full" variant="outline" onClick={() => { setDetailId(null); edit(item); }}><Pencil className="h-4 w-4" />Editar</Button>}
                {loan && !loan.paidAt && <Button className="h-10 w-full" variant="outline" onClick={() => remind(item)}><Bell className="h-4 w-4" />Lembrete</Button>}
                <Button className="h-10 w-full text-destructive hover:text-destructive" variant="outline" aria-label={`Excluir empréstimo de ${item.name}`} onClick={() => { setDetailId(null); setConfirm({ item, action: "delete" }); }}><Trash2 className="h-4 w-4" />Excluir</Button>
                <Button className="h-10 w-full" variant="outline" onClick={() => setDetailId(null)}>Fechar</Button>
              </div>
            </div>
          </div>;
        })() : null}
      </DialogContent>
    </Dialog>
    <LoanClientHistory selected={data.items.find(item => item.id === historyId && historyFolders.some(f => f.id === item.folderId)) || null} items={data.items} folders={historyFolders} today={today} onClose={() => setHistoryId(null)} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] [&>div]:shrink-0 [&>form]:shrink-0 sm:max-w-lg sm:p-6"><DialogHeader className="pr-8 text-left"><DialogTitle>{editing ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle><DialogDescription>Informe as condições combinadas com o cliente.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">{([['name', 'Nome do cliente', 'text'], ['phone', 'WhatsApp com DDI', 'tel'], ['principal', 'Valor emprestado (R$)', 'text'], ['agreedAmount', 'Valor a pagar no vencimento (R$)', 'text'], ['lentAt', 'Data do empréstimo', 'date'], ['dueDate', 'Vencimento', 'date']] as const).map(([key, label, type]) => <div key={key} className={`min-w-0 space-y-1 ${key === 'name' || key === 'phone' ? 'col-span-2 sm:col-span-1' : ''}`}><Label className="flex min-h-8 items-end text-xs leading-tight" htmlFor={`loan-${key}`}>{label}</Label><Input className="min-w-0" id={`loan-${key}`} type={type} disabled={!!(editing && readLoan(editing)?.balanceState) && key !== "name" && key !== "phone"} inputMode={key === 'principal' || key === 'agreedAmount' ? 'decimal' : undefined} required={key !== 'phone'} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>)}</div>
      {editing && readLoan(editing)?.balanceState && <p className="text-xs text-muted-foreground">Há pagamentos parciais registrados. As condições financeiras ficam preservadas; nome, telefone e observações podem ser alterados.</p>}
      <div className="rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">Juros após o vencimento (opcional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs" htmlFor="loan-rate-type">Tipo da taxa</Label>
            <select id="loan-rate-type" disabled={!!(editing && readLoan(editing)?.balanceState)} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={form.lateRateType} onChange={e => setForm(p => ({ ...p, lateRateType: e.target.value as NonNullable<LoanTerms["lateRateType"]> }))}><option value="percent">Porcentagem (%)</option><option value="amount">Valor em reais (R$)</option></select>
          </div>
          <div className="space-y-1">
            <Label className="flex h-8 items-center text-xs" htmlFor="loan-rate">{form.lateRateType === "amount" ? "Taxa (R$)" : "Taxa (%)"}</Label>
            <Input id="loan-rate" disabled={!!(editing && readLoan(editing)?.balanceState)} inputMode="decimal" required value={form.lateRate} onChange={e => setForm(p => ({ ...p, lateRate: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <div className="flex h-8 items-center gap-1">
              <Label className="text-xs" htmlFor="loan-period">Período da taxa</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="Como funcionam os juros ao dia" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="max-h-[65dvh] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto text-sm">
                  <p className="font-semibold">Como funcionam os juros ao dia?</p>
                  <p><strong>Porcentagem:</strong> calculada sobre o valor combinado no vencimento. <strong>Valor em reais:</strong> acrescenta o valor informado por período, independentemente do saldo.</p>
                  <p><strong>Valor em reais:</strong> R$ 5 ao dia acrescenta R$ 25 em 5 dias de atraso.</p>
                  <p><strong>Porcentagem:</strong> 1% ao dia sobre R$ 1.000 acrescenta R$ 10 por dia. Em 5 dias, o total será R$ 1.050.</p>
                  <p className="border-t pt-2 text-xs text-muted-foreground">Os juros começam no dia seguinte ao vencimento e não acumulam juros sobre juros. Na opção porcentagem, a base é sempre o valor combinado no vencimento. Com taxa 0, o valor não aumenta após vencer.</p>
                </PopoverContent>
              </Popover>
            </div>
            <Input id="loan-period" value="Ao dia" readOnly />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Use 0 para não cobrar juros por atraso. Toque no ícone de informação para ver exemplos.</p>
      </div>
      <div className="space-y-1"><Label htmlFor="loan-notes">Observações</Label><Textarea id="loan-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div><DialogFooter className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid sm:grid-cols-2 sm:space-x-0"><Button className="h-11 w-full px-2 text-xs sm:text-sm" type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="h-11 w-full px-2 text-xs sm:text-sm" type="submit">Salvar empréstimo</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={v => { if (!v) setConfirm(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirm?.action === "interest" ? "Receber somente os juros" : confirm?.action === "pay" ? "Quitar o empréstimo" : "Excluir empréstimo?"}</DialogTitle><DialogDescription>{confirm?.action === "delete" ? "O registro será removido. Esta ação não pode ser desfeita." : `${confirm?.item.name} · Confirme somente depois de receber o pagamento.`}</DialogDescription></DialogHeader>
        {paymentLoan && paymentBalance && <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{confirm?.action === "interest" ? "Juros a receber agora" : "Total a receber — capital + juros"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(confirm?.action === "interest" ? paymentBalance.total - paymentBalance.principalRemaining : paymentBalance.total)}</p>{paymentBalance.lateInterest > 0 && <p className="mt-1 text-xs text-muted-foreground">Inclui {money(paymentBalance.lateInterest)} de juros por atraso.</p>}</div>
          {confirm?.action === "interest" ? <>
            <p className="text-sm">O capital de <strong>{money(paymentBalance.principalRemaining)}</strong> continua em aberto. No próximo período, o valor combinado será <strong>{money(paymentBalance.principalRemaining + paymentLoan.agreedAmount - paymentLoan.principal)}</strong>, com os mesmos juros do período.</p>
            <div className="space-y-1"><Label htmlFor="loan-payment-next-due">Novo vencimento</Label><Input id="loan-payment-next-due" type="date" required value={confirm.nextDueDate || ""} onChange={e => setConfirm(value => value ? { ...value, nextDueDate: e.target.value } : null)} /></div>
            <p className="text-xs text-muted-foreground">Sugerido: um mês após o vencimento atual. Você pode ajustar a data antes de confirmar. Este pagamento será registrado como juros, sem abater o capital.</p>
          </> : <p className="text-sm text-muted-foreground">A quitação paga o capital e os juros atuais, encerra os juros futuros e os lembretes automáticos. O histórico dos pagamentos anteriores será mantido.</p>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button><Button variant={confirm?.action === "delete" ? "destructive" : "default"} disabled={confirm?.action === "interest" && (!confirm.nextDueDate || confirm.nextDueDate <= today || confirm.nextDueDate <= (paymentLoan?.dueDate || ""))} onClick={confirmAction}>Confirmar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
