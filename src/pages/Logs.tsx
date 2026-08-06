import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCopy,
  Coins,
  FlaskConical,
  History,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useHideBalance } from "@/hooks/useHideBalance";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBrDate, formatMoney } from "@/lib/format";
import { normSearch } from "@/lib/utils";
import {
  loadIptvJobs,
  loadIptvJobsRemote,
  saveIptvJobs,
  patchIptvJob,
  applyRenewalToItem,
  copyText,
  type IptvJob,
} from "@/lib/iptvAutomation";
import {
  ensureIptvToken,
  listIptvResellers,
  listIptvResellerLogs,
  resolveIptvResellerPanelId,
  type IptvPanelCreds,
  type IptvResellerMovement,
} from "@/lib/iptvPanelApi";
import { loadAutomationsConfig } from "@/lib/automationsConfig";
import {
  loadIptvPlatformConfig,
  DEFAULT_IPTV_PANEL_URL,
} from "@/lib/platformApi";
import { openPanelWindow } from "@/lib/panelKeepAlive";
import { isRevenueFolderType } from "@/types";
import { cn } from "@/lib/utils";

function statusLabel(s: IptvJob["status"]) {
  switch (s) {
    case "pending":
      return "Pendente";
    case "doing":
      return "No painel";
    case "done":
      return "Concluído";
    case "failed":
      return "Falhou";
  }
}

function formatMovementAt(raw?: string): string {
  if (!raw) return "—";
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}:\d{2}(?::\d{2})?))?$/.exec(
    s,
  );
  if (m) {
    const d = `${m[3]}/${m[2]}/${m[1]}`;
    return m[4] ? `${d} ${m[4]}` : d;
  }
  return s;
}

/**
 * Página de Logs: renovações, testes e recargas de revendedores
 * (movimentações do painel UniPlay). Antes ficava dentro de Automações.
 */
export default function LogsPage() {
  const { user, data, setData } = useApp();
  const { user: maskUser } = useHideBalance();

  const [jobs, setJobs] = useState<IptvJob[]>([]);
  const [logsSubTab, setLogsSubTab] = useState("renovacoes");
  const [renewQ, setRenewQ] = useState("");
  const [testLogQ, setTestLogQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<IptvJob | null>(null);

  // Movimentações de revendedores (Recargas)
  const [movementRows, setMovementRows] = useState<
    {
      resellerName: string;
      resellerUsername: string;
      move: IptvResellerMovement;
    }[]
  >([]);
  const [movementQ, setMovementQ] = useState("");
  const [loadingMovements, setLoadingMovements] = useState(false);
  const busyMovRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    setJobs(loadIptvJobs(user.id));
    void loadIptvJobsRemote(user.id).then((merged) => setJobs(merged));
  }, [user]);

  const persistJobs = (next: IptvJob[]) => {
    setJobs(next);
    if (user) saveIptvJobs(user.id, next);
  };

  const jobMatchesQuery = (job: IptvJob, query: string) => {
    const qn = normSearch(query);
    if (!qn) return true;
    const hay = normSearch(
      [
        job.clientName,
        job.panelUsername,
        job.note,
        job.panelPassword || "",
        job.kind === "renew" ? "renovação" : "teste",
      ].join(" "),
    );
    return hay.includes(qn);
  };

  const clientUsernameSet = useMemo(() => {
    const revenueIds = new Set(
      data.folders
        .filter((f) => f.userId === user?.id && isRevenueFolderType(f.type))
        .map((f) => f.id),
    );
    const set = new Set<string>();
    for (const i of data.items) {
      if (!revenueIds.has(i.folderId)) continue;
      const u = i.itemId.trim().toLowerCase();
      if (u) set.add(u);
    }
    return set;
  }, [data.folders, data.items, user?.id]);

  const isRealTestJob = (j: IptvJob) => {
    if (j.kind !== "test") return false;
    const u = j.panelUsername.trim().toLowerCase();
    if (u && clientUsernameSet.has(u)) return false;
    if (j.status === "pending" || j.status === "doing") return true;
    const dueRaw = String(j.dueDate || "").trim();
    if (dueRaw) {
      const due = Date.parse(dueRaw.replace(" ", "T"));
      if (Number.isFinite(due) && due - Date.now() > 2 * 86_400_000) {
        return false;
      }
    }
    return true;
  };

  const openRenewJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === "renew" &&
          (j.status === "pending" || j.status === "doing") &&
          jobMatchesQuery(j, renewQ),
      ),
    [jobs, renewQ],
  );

  const renewLog = useMemo(() => {
    const list = jobs.filter(
      (j) =>
        j.kind === "renew" &&
        (j.status === "done" || j.status === "failed") &&
        jobMatchesQuery(j, renewQ),
    );
    return list.slice(0, renewQ.trim() ? 150 : 80);
  }, [jobs, renewQ]);

  const renewLogCount = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === "renew" && (j.status === "done" || j.status === "failed"),
      ).length,
    [jobs],
  );

  const testLog = useMemo(() => {
    const list = jobs
      .filter((j) => isRealTestJob(j) && jobMatchesQuery(j, testLogQ))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list.slice(0, testLogQ.trim() ? 300 : 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, testLogQ, clientUsernameSet]);

  const testLogCount = useMemo(
    () => jobs.filter(isRealTestJob).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, clientUsernameSet],
  );

  const buildCreds = async (): Promise<IptvPanelCreds> => {
    const cfg = loadAutomationsConfig(user?.id || "0");
    const plat = await loadIptvPlatformConfig();
    const ensured = await ensureIptvToken({
      apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
      bearerToken: cfg.iptvBearerToken?.trim() || "",
      username: cfg.iptvUsername?.trim() || undefined,
      password: cfg.iptvPassword || undefined,
      defaultPackage: plat.packageId || "1",
      regPassword: plat.regPassword || undefined,
      apiProxyUrl: plat.apiProxyUrl || undefined,
    });
    return {
      apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
      bearerToken: ensured.token,
      username: cfg.iptvUsername?.trim() || undefined,
      password: cfg.iptvPassword || undefined,
      defaultPackage: plat.packageId.trim() || "1",
      regPassword: plat.regPassword?.trim() || undefined,
      apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
    };
  };

  /** Recargas de todos os revendedores (Logs de Movimentações). */
  const refreshResellerMovements = async (silent = false) => {
    if (!user || busyMovRef.current) return;
    busyMovRef.current = true;
    setLoadingMovements(true);
    try {
      const creds = await buildCreds();
      const resellerList = await listIptvResellers(creds);
      const agg: {
        resellerName: string;
        resellerUsername: string;
        move: IptvResellerMovement;
      }[] = [];
      await Promise.all(
        resellerList.map(async (r) => {
          const id = resolveIptvResellerPanelId(r);
          if (id == null) return;
          try {
            const moves = await listIptvResellerLogs(creds, id);
            const name = String(r.name || r.username || r.id || "");
            const uname = String(r.username || "");
            for (const move of moves) {
              agg.push({ resellerName: name, resellerUsername: uname, move });
            }
          } catch {
            /* movimentações inacessíveis para este revendedor */
          }
        }),
      );
      agg.sort(
        (a, b) =>
          (Date.parse(b.move.at) || 0) - (Date.parse(a.move.at) || 0),
      );
      setMovementRows(agg);
      if (!silent) {
        toast.success(
          agg.length
            ? `${agg.length} movimento(s) de recarga carregados`
            : "Nenhuma movimentação de recarga encontrada",
        );
      }
    } catch (e) {
      if (!silent) {
        toast.error(
          e instanceof Error ? e.message : "Falha ao carregar movimentações",
        );
      }
    } finally {
      busyMovRef.current = false;
      setLoadingMovements(false);
    }
  };

  useEffect(() => {
    if (logsSubTab === "recargas" && movementRows.length === 0) {
      void refreshResellerMovements(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsSubTab]);

  const startInPanel = async (job: IptvJob) => {
    setBusyId(job.id);
    try {
      const ok = await copyText(job.panelUsername);
      const plat = await loadIptvPlatformConfig();
      const url = plat.panelUrl.trim() || DEFAULT_IPTV_PANEL_URL;
      openPanelWindow(url);
      persistJobs(patchIptvJob(jobs, job.id, { status: "doing" }));
      toast.message(
        ok
          ? `Usuário copiado: ${job.panelUsername} — cole no painel`
          : `Abra o painel e busque: ${job.panelUsername}`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const completeJob = (job: IptvJob) => {
    setBusyId(job.id);
    try {
      if (job.kind === "renew" && job.itemRefId) {
        const item = data.items.find((i) => i.id === job.itemRefId);
        if (item) {
          const updated = applyRenewalToItem(item, job.months);
          setData({
            ...data,
            items: data.items.map((i) =>
              i.id === item.id ? updated : i,
            ),
          });
          toast.success(
            `Renovado no AuxPlus até ${formatBrDate(updated.dueDate)}`,
          );
        } else {
          toast.message("Item não encontrado — job só marcado como concluído");
        }
      } else {
        toast.success("Teste marcado como concluído");
      }
      persistJobs(patchIptvJob(jobs, job.id, { status: "done" }));
    } finally {
      setBusyId(null);
    }
  };

  const failJob = (job: IptvJob) => {
    persistJobs(patchIptvJob(jobs, job.id, { status: "failed" }));
    toast.message("Marcado como falhou");
  };

  if (!user) return null;

  const movementFiltered = useMemo(() => {
    const qn = normSearch(movementQ);
    return movementRows.filter(
      (r) =>
        !qn ||
        normSearch(r.resellerName).includes(qn) ||
        normSearch(r.resellerUsername).includes(qn) ||
        normSearch(String(r.move.toUser || "")).includes(qn) ||
        normSearch(String(r.move.fromUser || "")).includes(qn) ||
        normSearch(String(r.move.obs || "")).includes(qn),
    );
  }, [movementRows, movementQ]);

  return (
    <div className="ax-page">
      <PageHeader
        title="Logs"
        description="Renovações, testes e recargas de revendedores."
      />

      <Tabs
        value={logsSubTab}
        onValueChange={setLogsSubTab}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap bg-background/80">
          <TabsTrigger value="renovacoes" className="gap-1.5">
            <CalendarPlus className="h-3.5 w-3.5" />
            Renovações
            {renewLogCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 px-1.5 text-[10px]"
              >
                {renewLogCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="teste" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Teste
            {testLogCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 px-1.5 text-[10px]"
              >
                {testLogCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="recargas" className="gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            Recargas
            {movementRows.length > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 px-1.5 text-[10px]"
              >
                {movementRows.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="renovacoes" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight">
                Renovações e extensões
              </h2>
              <p className="text-xs text-muted-foreground">
                Planos renovados ou estendidos · sincroniza na conta
                {renewLogCount > 0 ? ` · ${renewLogCount} registro(s)` : ""}
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={renewQ}
                onChange={(e) => setRenewQ(e.target.value)}
                placeholder="Buscar renovação (nome, usuário…)"
                className="h-9 pl-8"
              />
            </div>

            {openRenewJobs.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Em andamento
                </p>
                <ul className="space-y-1.5">
                  {openRenewJobs.map((job) => (
                    <li
                      key={job.id}
                      className="space-y-2 rounded-md border px-2.5 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium leading-tight">
                            {job.clientName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {maskUser(job.panelUsername)} · +{job.months}{" "}
                            {job.months === 1 ? "mês" : "meses"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            job.status === "doing" &&
                              "border-primary/40 bg-primary/10 text-primary",
                          )}
                        >
                          {statusLabel(job.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={() => void startInPanel(job)}
                          disabled={busyId === job.id}
                        >
                          {busyId === job.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          )}
                          Abrir painel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => completeJob(job)}
                          disabled={busyId === job.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Concluí
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => failJob(job)}
                        >
                          Falhou
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {renewLog.length > 0 ? (
              <ul className="space-y-2">
                {renewLog.map((job) => {
                  const extend =
                    /estend/i.test(job.note || "") ||
                    /estend/i.test(job.clientName || "");
                  return (
                    <li
                      key={job.id}
                      className="rounded-md border px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium leading-tight">
                          {job.clientName}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px]",
                            job.status === "done" &&
                              "border-success/40 bg-success/10 text-success",
                            job.status === "failed" &&
                              "border-destructive/40 bg-destructive/10 text-destructive",
                          )}
                        >
                          {job.status === "done"
                            ? extend
                              ? "Estendido"
                              : "Renovado"
                            : statusLabel(job.status)}
                        </Badge>
                      </div>
                      <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                        <div>
                          <dt className="inline text-muted-foreground/80">
                            Usuário:{" "}
                          </dt>
                          <dd className="inline font-mono text-foreground/80">
                            {maskUser(job.panelUsername)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground/80">
                            Plano:{" "}
                          </dt>
                          <dd className="inline text-foreground/80">
                            +{job.months}{" "}
                            {job.months === 1 ? "mês" : "meses"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground/80">
                            Novo vencimento:{" "}
                          </dt>
                          <dd className="inline text-foreground/80">
                            {job.dueDate ? formatBrDate(job.dueDate) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground/80">
                            {extend ? "Estendido em: " : "Renovado em: "}
                          </dt>
                          <dd className="inline text-foreground/80">
                            {format(
                              new Date(job.updatedAt),
                              "dd/MM/yyyy HH:mm",
                            )}
                          </dd>
                        </div>
                      </dl>
                      {job.note ? (
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {job.note}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          onClick={() => setDetailJob(job)}
                        >
                          Detalhes
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {openRenewJobs.length === 0 && renewLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {renewQ.trim()
                  ? "Nenhum resultado para essa busca."
                  : "Nenhuma renovação ou extensão registrada ainda."}
              </p>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="teste" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  Testes
                </h2>
                <p className="text-xs text-muted-foreground">
                  Testes gerados no painel
                  {testLogCount > 0 ? ` · ${testLogCount} registro(s)` : ""}
                </p>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={testLogQ}
                onChange={(e) => setTestLogQ(e.target.value)}
                placeholder="Buscar teste (nome, usuário…)"
                className="h-9 pl-8"
              />
            </div>

            {testLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {testLogQ.trim()
                  ? "Nenhum resultado para essa busca."
                  : "Nenhum teste registrado ainda."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {testLog.map((job) => {
                  const isOpen =
                    job.status === "pending" || job.status === "doing";
                  return (
                    <li
                      key={job.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-tight">
                          {job.clientName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {maskUser(job.panelUsername)}
                          {job.testHours ? ` · ${job.testHours}h` : ""}
                          {job.dueDate
                            ? ` · ${formatBrDate(job.dueDate)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 px-2.5"
                          onClick={() => setDetailJob(job)}
                        >
                          Detalhes
                        </Button>
                        {isOpen ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2.5"
                            onClick={() => completeJob(job)}
                            disabled={busyId === job.id}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Concluí
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="recargas" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  Recargas de revendedores
                </h2>
                <p className="text-xs text-muted-foreground">
                  Histórico a partir das movimentações da UniPlay
                  {movementRows.length > 0
                    ? ` · ${movementRows.length} registro(s)`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={loadingMovements}
                onClick={() => void refreshResellerMovements(false)}
              >
                {loadingMovements ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Atualizar
              </Button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={movementQ}
                onChange={(e) => setMovementQ(e.target.value)}
                placeholder="Filtrar por revendedor, usuário ou obs…"
                className="h-9 pl-8"
              />
            </div>

            {loadingMovements && movementRows.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando movimentações…
              </p>
            ) : movementRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma movimentação de recarga ainda. Toque em{" "}
                <b>Atualizar</b>.
              </p>
            ) : movementFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma movimentação para essa busca.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {movementFiltered.slice(0, 300).map((r, i) => (
                  <li
                    key={`${r.resellerUsername}-${String(r.move.id)}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">
                        {r.resellerName || r.resellerUsername}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatMovementAt(r.move.at)}
                        {r.move.toUser || r.move.fromUser
                          ? ` · ${r.move.fromUser || "?"} → ${
                              r.move.toUser || "?"
                            }`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant="outline" className="tabular-nums">
                        {Number(r.move.credits) || 0} créd.
                      </Badge>
                      <Badge variant="outline" className="tabular-nums">
                        {formatMoney(Number(r.move.faturado) || 0)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(detailJob)}
        onOpenChange={(o) => !o && setDetailJob(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              {detailJob?.clientName}
            </DialogTitle>
            <DialogDescription>
              Detalhes do registro · {statusLabel(detailJob?.status || "pending")}
            </DialogDescription>
          </DialogHeader>
          {detailJob ? (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="inline text-muted-foreground">Usuário: </dt>
                <dd className="inline font-mono">{maskUser(detailJob.panelUsername)}</dd>
              </div>
              {detailJob.panelPassword ? (
                <div>
                  <dt className="inline text-muted-foreground">Senha: </dt>
                  <dd className="inline font-mono">{detailJob.panelPassword}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline text-muted-foreground">Vencimento: </dt>
                <dd className="inline">
                  {detailJob.dueDate ? formatBrDate(detailJob.dueDate) : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {detailJob.kind === "renew" ? "Plano: " : "Horas: "}
                </dt>
                <dd className="inline">
                  {detailJob.kind === "renew"
                    ? `+${detailJob.months} ${detailJob.months === 1 ? "mês" : "meses"}`
                    : `${detailJob.testHours || 6}h`}
                </dd>
              </div>
              {detailJob.m3u ? (
                <div>
                  <dt className="inline text-muted-foreground">M3U: </dt>
                  <dd className="inline break-all font-mono text-xs">
                    {detailJob.m3u}
                  </dd>
                </div>
              ) : null}
              {detailJob.note ? (
                <div>
                  <dt className="inline text-muted-foreground">Nota: </dt>
                  <dd className="inline">{detailJob.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
