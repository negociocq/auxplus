import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, RefreshCw, Users, Wallet } from "lucide-react";
import type { Folder, Item } from "@/types";
import type { UniplayRenewalEvent, UniplayRecreatedLine, UniplayCreditEvent } from "@/lib/uniplayRenewalLogs";
import { lookupUniplayRenewals } from "@/lib/uniplayRenewalLookup";
import { brazilDay, renewalRange, summarizeRenewals } from "@/lib/renewalSummary";
import { summarizeReceivedOperations } from "@/lib/receivedOperations";
import { estimateMonthEnd } from "@/lib/monthEndEstimate";
import { firstClientDate, boundedRenewalRange, loadRenewalSearchScope } from "@/lib/renewalSearchScope";
import { useHideBalance } from "@/hooks/useHideBalance";
import { Button } from "@/components/ui/button";
import { BoundedDatePicker } from "@/components/dashboard/BoundedDatePicker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function RenewalSummary({ userId, folders, items, resellersFolderId = "", onRefresh }: { userId: string; folders: Folder[]; items: Item[]; resellersFolderId?: string; onRefresh?: () => void }) {
  const { money, num, text } = useHideBalance();
  const [preset, setPreset] = useState("today");
  const [start, setStart] = useState(brazilDay);
  const [end, setEnd] = useState(brazilDay);
  const [folderId, setFolderId] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [today, setToday] = useState(brazilDay);
  const [panel, setPanel] = useState<{ userId: string; start: string; end: string; source: "uniplay" | "folders"; events: UniplayRenewalEvent[]; recreations: UniplayRecreatedLine[]; creditEvents: UniplayCreditEvent[]; creditUnitPrice: number } | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [scope, setScope] = useState<{ userId: string; source: "uniplay" | "folders"; firstDate: string | null } | null>(null);
  const [scopeError, setScopeError] = useState("");
  const firstFolderDate = firstClientDate(items.filter((item) => folders.some((folder) => folder.id === item.folderId)));
  useEffect(() => {
    let cancelled = false;
    setScope(null);
    setScopeError("");
    void loadRenewalSearchScope(userId, firstFolderDate).then((result) => {
      if (!cancelled) setScope({ ...result, userId });
    }).catch((error) => { if (!cancelled) setScopeError(error instanceof Error ? error.message : "Não foi possível identificar o primeiro cliente."); });
    return () => { cancelled = true; };
  }, [userId, firstFolderDate, refresh]);
  const scopeReady = scope?.userId === userId;
  const minimumDate = scopeReady ? scope.firstDate || today : today;
  const range = boundedRenewalRange(preset === "custom" ? { start, end } : renewalRange(preset, today), minimumDate, today);
  useEffect(() => {
    if (!scopeReady || preset !== "custom") return;
    if (start !== range.start) setStart(range.start);
    if (end !== range.end) setEnd(range.end);
  }, [scopeReady, preset, start, end, range.start, range.end]);
  const invalid = !range.start || !range.end || range.start > range.end;
  useEffect(() => {
    if (invalid || !scopeReady) { setPanelLoading(false); return; }
    let cancelled = false;
    setPanelError("");
    setPanelLoading(true);
    const timer = window.setTimeout(() => {
      void lookupUniplayRenewals(userId, range.start, range.end, minimumDate).then((result) => {
        if (!cancelled) setPanel({ ...result, userId, start: range.start, end: range.end });
      }).catch((error) => {
        if (!cancelled) setPanelError(error instanceof Error ? error.message : "Não foi possível consultar os logs da Uniplay.");
      }).finally(() => { if (!cancelled) setPanelLoading(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [userId, range.start, range.end, invalid, refresh, scopeReady, minimumDate]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(brazilDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const filteredItems = useMemo(() => items.filter((item) => folders.some((folder) => folder.id === item.folderId) && (folderId === "all" || item.folderId === folderId)), [items, folders, folderId]);
  const summary = useMemo(() => {
    const current = panel?.userId === userId && panel.start === range.start && panel.end === range.end;
    if (!current) return summarizeRenewals([], range.start, range.end);
    return summarizeReceivedOperations(filteredItems, range.start, range.end, { ...panel, months: [] }, resellersFolderId, folderId);
  }, [filteredItems, panel, userId, range.start, range.end, folderId, resellersFolderId]);
  useEffect(() => { setPage(1); }, [preset, start, end, folderId]);
  const pages = Math.max(1, Math.ceil(summary.rows.length / 10));
  const currentPage = Math.min(page, pages);
  const periodLabel = preset === "today" ? "hoje" : preset === "yesterday" ? "ontem" : "no período";
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  const localSource = panel?.source === "folders";
  const showEstimate = range.start === (minimumDate > `${today.slice(0, 7)}-01` ? minimumDate : `${today.slice(0, 7)}-01`) && range.end === today;
  const estimate = useMemo(() => estimateMonthEnd(filteredItems, today, summary, resellersFolderId), [filteredItems, today, summary, resellersFolderId]);

  return <section className="mb-6 space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-label="Resumo de renovações">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-primary" />Renovações e créditos recebidos</h2><p className="mt-1 text-sm text-muted-foreground">{localSource ? "Pagamentos de renovações e recargas registrados nas suas pastas." : "Renovações e créditos pelos logs da Uniplay, com os preços das pastas."}</p></div>
      <Button type="button" size="sm" variant="outline" disabled={!scopeError && (panelLoading || !scopeReady)} onClick={() => { setRefresh((value) => value + 1); onRefresh?.(); }}><RefreshCw className={`h-4 w-4 ${!scopeError && (panelLoading || !scopeReady) ? "animate-spin" : ""}`} />Atualizar</Button>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Período das renovações">
      {[["today", "Hoje"], ["yesterday", "Ontem"], ["week", "Esta semana"], ["month", "Este mês"], ["custom", "Escolher período"]].map(([value, label]) => <Button key={value} type="button" size="sm" variant={preset === value ? "default" : "outline"} aria-pressed={preset === value} disabled={!scopeReady || (value === "custom" ? !scope.firstDate : renewalRange(value, today).end < minimumDate)} onClick={() => setPreset(value)}>{label}</Button>)}
    </div>
    <div className="grid items-end gap-3 sm:grid-cols-3">
      <div className="space-y-1"><Label htmlFor="renewal-folder">Pasta</Label><Select value={folderId} onValueChange={setFolderId}><SelectTrigger id="renewal-folder"><SelectValue placeholder="Todas as pastas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as pastas</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div>
      {preset === "custom" ? <><div className="space-y-1"><Label htmlFor="renewal-start">De</Label><BoundedDatePicker id="renewal-start" label="De" value={start} min={minimumDate} max={end < today ? end : today} disabled={!scopeReady || !scope.firstDate} onChange={setStart} /></div><div className="space-y-1"><Label htmlFor="renewal-end">Até</Label><BoundedDatePicker id="renewal-end" label="Até" value={end} min={start > minimumDate ? start : minimumDate} max={today} disabled={!scopeReady || !scope.firstDate} onChange={setEnd} /></div></> : <p className="text-xs text-muted-foreground sm:col-span-2">{range.start.split("-").reverse().join("/")} a {range.end.split("-").reverse().join("/")} · Horário de Brasília · Semana a partir de segunda-feira</p>}
    </div>
    {scopeError ? <p role="alert" className="text-sm text-destructive">{scopeError}</p> : scopeReady ? <p className="text-xs text-muted-foreground">{scope.firstDate ? `Consultas disponíveis desde ${minimumDate.split("-").reverse().join("/")} · primeiro cliente ${scope.source === "uniplay" ? "da Uniplay" : "das pastas"}.` : "Nenhum cliente com data de cadastro encontrado."}</p> : <p role="status" className="text-sm text-muted-foreground">Identificando a data do primeiro cliente…</p>}
    {invalid ? <p role="alert" className="text-sm text-destructive">Escolha uma data inicial e uma data final válidas.</p> : <>
      {panelError ? <p role="alert" className="text-sm text-destructive">{panelError} Não foi possível atualizar a consulta. Tente novamente.</p> : null}
      {panelLoading ? <p role="status" className="text-sm text-muted-foreground">Consultando o período e identificando a origem dos registros…</p> : null}
      {scopeReady && !scopeError && !panelLoading && !panelError && panel?.userId === userId && panel.start === range.start && panel.end === range.end ? <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-primary/5 p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" />{localSource ? "Renovações nas pastas" : "Renovações de IPTV"}</p><p className="mt-2 text-3xl font-semibold">{num(summary.renewalCount)}</p><p className="mt-1 text-xs text-muted-foreground">{money(summary.renewalTotal)} {localSource ? "em pagamentos registrados" : "pelos preços vigentes nas datas das renovações"}</p></div>
        <div className="rounded-xl border bg-primary/5 p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" />Créditos para revendedores</p><p className="mt-2 text-3xl font-semibold">{num(localSource ? summary.creditOperations : summary.credits)} <span className="text-base font-normal">{localSource ? "recargas" : "créditos"}</span></p><p className="mt-1 text-xs text-muted-foreground">{num(summary.creditOperations)} recarga(s) · {money(summary.creditTotal)}</p><p className="mt-1 text-xs text-muted-foreground">{localSource ? "Usa os valores gravados nos pagamentos da pasta." : `${money(panel.creditUnitPrice)} por crédito, configurado em Uniplay → Conta.`}</p></div>
        <div className="rounded-xl border bg-primary/5 p-4"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" />{summary.missingAmounts > 0 ? "Subtotal conhecido" : "Total no período"}</p><p className="mt-2 text-3xl font-semibold">{money(summary.total)}</p><p className="mt-1 text-xs text-muted-foreground">{localSource ? "Pagamentos de clientes + recargas dos revendedores" : "IPTV + créditos dos revendedores"}</p></div>
      </div>
      <p aria-live="polite" className="text-sm font-medium">{num(summary.renewalCount)} renovação(ões) e {num(summary.creditOperations)} recarga(s) de revendedores {periodLabel}, {summary.missingAmounts > 0 ? "com valores conhecidos de" : "totalizando"} {money(summary.total)}.</p>
      {showEstimate ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium">Estimativa de fechamento do mês</p>
        <p className="mt-2 text-3xl font-semibold">{money(estimate.total)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{money(summary.total)} registrados + {money(estimate.pendingTotal)} previstos de {num(estimate.pendingCount)} cliente(s) que ainda não renovaram e vencem neste mês.</p>
        <p className="mt-1 text-xs text-muted-foreground">Considera que todos os pendentes renovarão até {estimate.end.split("-").reverse().join("/")}, pelo preço do pacote. Inclui vencidos neste mês e mantém somente os créditos de revendedores já registrados.</p>
        {estimate.missingAmounts > 0 ? <p className="mt-2 text-xs text-muted-foreground">Estimativa parcial: {num(estimate.missingAmounts)} registro(s) sem preço identificado.</p> : null}
        {estimate.pendingCount > 0 ? <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Conferir clientes previstos</summary><ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">{estimate.pending.map((row) => <li key={row.item.id} className="flex flex-wrap justify-between gap-2 border-b py-2 last:border-0"><span>{text(row.item.name)} · {row.dueDate.split("-").reverse().join("/")}</span><span>{row.amount == null ? "Preço não cadastrado" : money(row.amount)}</span></li>)}</ul></details> : null}
      </div> : null}
      {summary.missingAmounts > 0 ? <p className="text-sm text-muted-foreground">{num(summary.missingAmounts)} operação(ões) sem preço identificado. O subtotal soma somente os valores encontrados.</p> : null}
      {folderId === "all" && summary.unmatchedRenewals > 0 ? <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground"><p>{num(summary.unmatchedRenewals)} operação(ões) sem correspondência única nas pastas. Renovações ficam sem valor; créditos usam o preço unitário configurado.</p><p className="mt-1 break-all">Usuários para conferir: {text(summary.unmatchedUsers.join(", "))}</p></div> : null}
      <Accordion type="single" collapsible><AccordionItem value="details" className="border-0"><AccordionTrigger>Conferir clientes e valores</AccordionTrigger><AccordionContent>
        {summary.rows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nenhuma renovação ou recarga registrada neste período e nesta pasta.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 font-medium">Data</th><th className="p-2 font-medium">Cliente</th><th className="p-2 font-medium">Pasta</th><th className="p-2 text-right font-medium">Valor</th><th className="p-2 font-medium">Registro</th></tr></thead><tbody>{summary.rows.slice((currentPage - 1) * 10, currentPage * 10).map((row) => <tr key={row.id} className="border-b last:border-0"><td className="whitespace-nowrap p-2">{row.paidAt.split("-").reverse().join("/")}</td><td className="p-2">{text(row.item?.name || `Usuário ${row.username}`)}{row.recreated ? <p className="mt-1 text-xs text-muted-foreground">Login no log: {text(row.username)} &rarr; atual: {text(row.currentUsername)}</p> : null}</td><td className="p-2">{row.item ? <Link className="text-primary underline" to={`/folders/${row.item.folderId}`}>{folderNames.get(row.item.folderId)}</Link> : <span className="text-muted-foreground">Sem cadastro</span>}</td><td className="whitespace-nowrap p-2 text-right">{row.amount == null ? "Preço não cadastrado" : money(row.amount)}</td><td className="p-2">{row.source === "Pasta" ? (row.kind === "credits" ? "Pasta · Recarga" : "Pasta · Renovação") : row.kind === "credits" ? `Uniplay · ${num(row.credits)} créditos` : "Uniplay · Renovação"}</td></tr>)}</tbody></table></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Página {num(currentPage)} de {num(pages)}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" size="sm" variant="outline" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div></div>
        </>}
      </AccordionContent></AccordionItem></Accordion>
      </> : null}
    </>}
    <p className="text-xs text-muted-foreground">{localSource ? "Sem Uniplay conectada: usa somente os pagamentos de renovações e recargas registrados nas pastas, na data e no valor gravados. Cadastros iniciais e estimativas por vencimento ficam fora." : <>Cada ID de log entra uma vez. IPTV usa o histórico de preços da pasta na data de cada renovação e segue as recriações de linha. Sem histórico anterior, usa o primeiro preço disponível. Revendedores usam a quantidade enviada pela sua conta × o preço atual por crédito (Uniplay → Conta). Compras de créditos para sua própria conta ficam fora. Pix não é somado novamente. Ao filtrar uma pasta, entram somente os usuários identificados nela.</>}</p>
  </section>;
}
