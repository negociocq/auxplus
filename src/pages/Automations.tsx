import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import {
  Cable,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  History,
  Loader2,
  MonitorPlay,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useApp } from "@/context/AppContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
  saveAutomationsConfig,
  saveAutomationsConfigRemote,
  type AutomationsConfig,
} from "@/lib/automationsConfig";
import {
  DEFAULT_IPTV_PANEL_URL,
  defaultIptvPlatformConfig,
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
  loadIptvPlatformConfig,
  type IptvPlatformConfig,
} from "@/lib/platformApi";
import {
  applyPanelDueToItem,
  applyRenewalToItem,
  copyText,
  createIptvJob,
  loadIptvJobs,
  mergePanelTestsIntoJobs,
  nextDueAfterRenew,
  patchIptvJob,
  saveIptvJobs,
  type IptvJob,
} from "@/lib/iptvAutomation";
import {
  activatePartnerApp,
  buildRenewalReceiptMessage,
  createIptvTest,
  deleteSmartApp,
  ensureIptvToken,
  fetchIptvUserPassword,
  findIptvUserByUsername,
  formatMacInput,
  getLastIssuedIptvToken,
  enrichCreateTestResult,
  IPTV_RENEW_OPTIONS,
  IPTV_TEST_HOURS,
  listIptvUsers,
  parseIptvExpToDateTime,
  resolveTestAccessLinks,
  listSmartAppsForUsername,
  PARTNER_APPS,
  rememberPartnerAppActivation,
  removeLocalPartnerApp,
  renewIptvUser,
  setDeviceNickname,
  tokenExpiresInSec,
  type IptvPanelCreds,
  type IptvRenewOption,
  type PartnerAppId,
  type SmartAppEntry,
} from "@/lib/iptvPanelApi";
import {
  fetchEvolutionStatus,
  sendEvolutionText,
} from "@/lib/whatsappAutomation";
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

export default function Automations() {
  const { user, data, setData } = useApp();
  const { hidden: hideSensitive, user: maskUser } = useHideBalance();
  const [config, setConfig] = useState<AutomationsConfig>(() =>
    loadAutomationsConfig(user?.id || "0"),
  );
  const [platform, setPlatform] = useState<IptvPlatformConfig>(
    defaultIptvPlatformConfig(),
  );
  const [bearer, setBearer] = useState(config.iptvBearerToken);
  const [panelUser, setPanelUser] = useState(config.iptvUsername);
  const [panelPass, setPanelPass] = useState(config.iptvPassword);
  const [showPass, setShowPass] = useState(false);
  const [tokenInfo, setTokenInfo] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState<IptvJob[]>([]);
  const [q, setQ] = useState("");
  const [renewMonths, setRenewMonths] = useState(config.renewMonths);
  const [testHours, setTestHours] = useState(config.testHours);
  const [syncFolderId, setSyncFolderId] = useState(config.syncFolderId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renewTargetId, setRenewTargetId] = useState<string | null>(null);
  const [renewOption, setRenewOption] = useState<IptvRenewOption>(
    IPTV_RENEW_OPTIONS[0],
  );
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testHoursPick, setTestHoursPick] = useState<number>(6);
  const [testNota, setTestNota] = useState("");
  const [syncingTests, setSyncingTests] = useState(false);
  const [jobsQ, setJobsQ] = useState("");
  const [renewQ, setRenewQ] = useState("");
  const [uniplaySubTab, setUniplaySubTab] = useState("conexao");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [activateOption, setActivateOption] = useState<IptvRenewOption>(
    IPTV_RENEW_OPTIONS[0],
  );
  const [activatingTest, setActivatingTest] = useState(false);
  const [lastTest, setLastTest] = useState<{
    jobId: string;
    username: string;
    password: string;
    m3u: string;
    dnsSmarters: string;
    clientName: string;
    hours: number;
    dueDate: string | null;
  } | null>(null);
  const [appId, setAppId] = useState<PartnerAppId>("prime");
  const [appUsername, setAppUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [appDevice, setAppDevice] = useState("");
  const [appNickname, setAppNickname] = useState("");
  const [showAppPass, setShowAppPass] = useState(false);
  const [activatingApp, setActivatingApp] = useState(false);
  const [lookingUpPass, setLookingUpPass] = useState(false);
  const [registeredApps, setRegisteredApps] = useState<SmartAppEntry[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [deletingAppId, setDeletingAppId] = useState<string | number | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    setJobs(loadIptvJobs(user.id));
    void loadIptvPlatformConfig().then(setPlatform);
    // Conta UniPlay vem da nuvem (todos os PCs) + cache local
    void loadAutomationsConfigRemote(user.id).then((next) => {
      setConfig(next);
      setBearer(next.iptvBearerToken);
      setPanelUser(next.iptvUsername);
      setPanelPass(next.iptvPassword);
      setRenewMonths(next.renewMonths);
      setTestHours(next.testHours);
      setSyncFolderId(next.syncFolderId);
    });
  }, [user]);

  const uniplayConnected = useMemo(() => {
    if (!bearer.trim()) return false;
    const left = tokenExpiresInSec(bearer);
    if (left == null) return true;
    return left > 0;
  }, [bearer]);

  useEffect(() => {
    const left = bearer ? tokenExpiresInSec(bearer) : null;
    if (left == null) {
      setTokenInfo(bearer ? "Token sem prazo legível" : "Sem conexão");
      return;
    }
    if (left <= 0) setTokenInfo("Sessão expirada — clique em Conectar");
    else {
      const h = Math.floor(left / 3600);
      const m = Math.floor((left % 3600) / 60);
      setTokenInfo(`Conectado · ~${h}h ${m}min`);
    }
  }, [bearer]);

  useEffect(() => {
    if (!uniplayConnected) {
      setUniplaySubTab("conexao");
      return;
    }
    // Ao conectar, abre Ativos (Conexão fica como 3ª aba)
    setUniplaySubTab((tab) => (tab === "conexao" ? "ativos" : tab));
  }, [uniplayConnected]);

  // Renova o Bearer sozinho a cada 15 min (se usuário/senha salvos)
  useEffect(() => {
    if (!user || !config.iptvAutoRefreshToken) return;
    if (!panelUser.trim() || !panelPass) return;

    const tick = async () => {
      try {
        const cur = loadAutomationsConfig(user.id);
        const plat = await loadIptvPlatformConfig();
        const { token, renewed } = await ensureIptvToken({
          apiBaseUrl: plat.apiBaseUrl,
          bearerToken: cur.iptvBearerToken,
          username: panelUser,
          password: panelPass,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        if (renewed || (token && token !== cur.iptvBearerToken)) {
          setBearer(token);
          setConfig((c) => ({ ...c, iptvBearerToken: token }));
          saveAutomationsConfig(user.id, {
            ...loadAutomationsConfig(user.id),
            iptvBearerToken: token,
            iptvUsername: panelUser.trim(),
            iptvPassword: panelPass,
          });
          if (renewed) toast.message("Sessão UniPlay renovada");
        }
      } catch {
        /* silencioso no intervalo */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user, config.iptvAutoRefreshToken, panelUser, panelPass]);

  const myFolders = useMemo(
    () =>
      data.folders.filter(
        (f) => f.userId === user?.id && isRevenueFolderType(f.type),
      ),
    [data.folders, user?.id],
  );

  /** Pastas tipo Cliente — onde o sync UniPlay pode ser ligado */
  const clientFolders = useMemo(
    () =>
      data.folders.filter(
        (f) => f.userId === user?.id && f.type === "Cliente",
      ),
    [data.folders, user?.id],
  );

  const clients = useMemo(() => {
    const folderIds = new Set(myFolders.map((f) => f.id));
    return data.items
      .filter((i) => folderIds.has(i.folderId) && i.isActive !== false)
      .sort((a, b) => {
        const da = a.dueDate || "9999";
        const db = b.dueDate || "9999";
        return da.localeCompare(db);
      });
  }, [data.items, myFolders]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Só lista após busca — evita poluir a tela com todos os clientes
    if (term.length < 2) return [];
    const rank = (status?: string | null) => {
      if (status === "Já Vencido") return 0;
      if (status === "Perto de Vencer") return 1;
      if (!status) return 2;
      return 3;
    };
    return clients
      .filter(
        (i) =>
          i.name.toLowerCase().includes(term) ||
          i.itemId.toLowerCase().includes(term) ||
          (i.phone || "").includes(term),
      )
      .sort((a, b) => {
        const rs = rank(a.status) - rank(b.status);
        if (rs !== 0) return rs;
        const da = a.dueDate || "9999-99-99";
        const db = b.dueDate || "9999-99-99";
        return da.localeCompare(db);
      })
      .slice(0, 50);
  }, [clients, q]);

  const jobMatchesQuery = (job: IptvJob, query: string) => {
    const qn = query.trim().toLowerCase();
    if (!qn) return true;
    const hay = [
      job.clientName,
      job.panelUsername,
      job.note,
      job.panelPassword || "",
      job.kind === "renew" ? "renovação" : "teste",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(qn);
  };

  const openTestJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === "test" &&
          (j.status === "pending" || j.status === "doing") &&
          jobMatchesQuery(j, jobsQ),
      ),
    [jobs, jobsQ],
  );
  const recentTestJobs = useMemo(() => {
    const list = jobs.filter(
      (j) =>
        j.kind === "test" &&
        (j.status === "done" || j.status === "failed") &&
        jobMatchesQuery(j, jobsQ),
    );
    return list.slice(0, jobsQ.trim() ? 100 : 30);
  }, [jobs, jobsQ]);
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
  const testJobsCount = useMemo(
    () => jobs.filter((j) => j.kind === "test").length,
    [jobs],
  );
  const renewLogCount = useMemo(
    () => jobs.filter((j) => j.kind === "renew").length,
    [jobs],
  );

  const detailJob = useMemo(
    () => (detailJobId ? jobs.find((j) => j.id === detailJobId) || null : null),
    [detailJobId, jobs],
  );

  if (!user) return null;

  const persistJobs = (next: IptvJob[]) => {
    setJobs(next);
    saveIptvJobs(user.id, next);
  };

  const persistConfig = (next: AutomationsConfig) => {
    setConfig(next);
    saveAutomationsConfig(user.id, next);
  };

  const panelCreds = (): IptvPanelCreds => ({
    apiBaseUrl: platform.apiBaseUrl || config.iptvApiBaseUrl,
    bearerToken: bearer.trim(),
    regPassword: platform.regPassword.trim() || undefined,
    defaultPackage: platform.packageId.trim() || "1",
    username: panelUser.trim() || undefined,
    password: panelPass || undefined,
    apiProxyUrl: platform.apiProxyUrl?.trim() || undefined,
  });

  const persistToken = (token: string) => {
    if (!user || !token) return;
    setBearer(token);
    const cur = loadAutomationsConfig(user.id);
    saveAutomationsConfig(user.id, { ...cur, iptvBearerToken: token });
    setConfig((c) => ({ ...c, iptvBearerToken: token }));
  };

  const refreshTokenNow = async () => {
    if (!panelUser.trim() || !panelPass) {
      toast.error("Salve usuário e senha da sua conta UniPlay");
      return;
    }
    setRefreshingToken(true);
    try {
      const plat = await loadIptvPlatformConfig();
      setPlatform(plat);
      const { token, renewed } = await ensureIptvToken(
        {
          apiBaseUrl: plat.apiBaseUrl,
          bearerToken: "",
          username: panelUser.trim(),
          password: panelPass,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        },
        10 ** 9,
      );
      persistToken(token);
      setUniplaySubTab("ativos");
      toast.success(renewed ? "UniPlay conectado" : "Sessão atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setRefreshingToken(false);
    }
  };

  const onSavePanel = async (e: FormEvent) => {
    e.preventDefault();
    if (!panelUser.trim() || !panelPass) {
      toast.error("Informe usuário e senha da sua conta");
      return;
    }
    setSaving(true);
    const next: AutomationsConfig = {
      ...config,
      iptvBearerToken: bearer.trim(),
      iptvUsername: panelUser.trim(),
      iptvPassword: panelPass,
      renewMonths,
      testHours,
      syncFolderId,
      iptvAutoRefreshToken: true,
    };
    setConfig(next);
    const saved = await saveAutomationsConfigRemote(user.id, next);
    setSaving(false);
    setShowPass(false);
    if (saved.warning) {
      toast.message("Conta salva neste PC", { description: saved.warning });
    } else {
      toast.success("Conta UniPlay salva em todos os dispositivos");
    }
    void refreshTokenNow();
  };

  const openPanel = () => {
    const url = platform.panelUrl.trim() || DEFAULT_IPTV_PANEL_URL;
    if (!url) {
      toast.error(
        "URL do painel ainda não foi configurada pelo administrador",
      );
      return;
    }
    try {
      openPanelWindow(url);
      toast.message("Painel aberto — faça login se pedir");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir painel");
    }
  };

  const openRenewDialog = (itemId: string) => {
    const preferred =
      IPTV_RENEW_OPTIONS.find((o) => o.months === renewMonths) ||
      IPTV_RENEW_OPTIONS[0];
    setRenewOption(preferred);
    setRenewTargetId(itemId);
  };

  const sendRenewalReceipt = async (
    phone: string,
    username: string,
    dueDate: string | null,
  ) => {
    if (!user) return;
    if (!phone.trim()) {
      toast.message("Renovado, mas sem telefone para enviar o comprovante");
      return;
    }
    try {
      const evo = await loadEvolutionPlatformConfig();
      if (!isEvolutionConfigured(evo)) {
        toast.message("Renovado. Configure o WhatsApp (Evolution) para enviar o comprovante");
        return;
      }
      const runtime = {
        apiBaseUrl: evo.apiBaseUrl,
        apiKey: evo.apiKey,
        instanceName: instanceNameForUser(
          evo.instancePrefix,
          user.id,
          user.username,
        ),
      };
      const status = await fetchEvolutionStatus(runtime);
      if (status !== "open") {
        toast.message("Renovado. WhatsApp desconectado — comprovante não enviado");
        return;
      }
      const text = buildRenewalReceiptMessage(
        username,
        formatBrDate(dueDate),
      );
      await sendEvolutionText(runtime, phone, text);
      toast.success("Comprovante enviado no WhatsApp do cliente");
    } catch (e) {
      toast.message(
        e instanceof Error
          ? `Renovado, mas falhou o WhatsApp: ${e.message}`
          : "Renovado, mas falhou o envio do comprovante",
      );
    }
  };

  const runApiRenew = async (itemId: string, option: IptvRenewOption) => {
    const item = clients.find((i) => i.id === itemId);
    if (!item) return;
    if (!item.itemId.trim()) {
      toast.error("Cliente sem usuário (campo Usuário) — preencha na pasta");
      return;
    }
    if (!bearer.trim()) {
      toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    const months = option.months;
    setRenewMonths(months);
    setRenewTargetId(null);
    const job = createIptvJob({
      kind: "renew",
      status: "doing",
      itemRefId: item.id,
      clientName: item.name,
      panelUsername: item.itemId.trim(),
      phone: item.phone || "",
      dueDate: item.dueDate,
      months,
      testHours,
      note: `API · ${option.label}`,
    });
    let nextJobs = [job, ...jobs];
    persistJobs(nextJobs);
    setBusyId(item.id);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const remote = await findIptvUserByUsername(creds, item.itemId.trim());
      if (!remote?.id) {
        throw new Error(
          `Usuário ${item.itemId} não encontrado no painel. Confira o login/token ou o reg_password.`,
        );
      }
      await renewIptvUser(creds, remote.id, option);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      // Busca de novo para pegar o vencimento real do painel → lembrete
      let panelExp: string | null | undefined;
      try {
        const after = await findIptvUserByUsername(creds, item.itemId.trim());
        panelExp = after?.exp_date ?? after?.expDate;
      } catch {
        panelExp = remote.exp_date ?? remote.expDate;
      }
      const updated = applyPanelDueToItem(item, {
        panelExp,
        months,
      });
      setData({
        ...data,
        items: data.items.map((i) => (i.id === item.id ? updated : i)),
      });
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "done",
        dueDate: updated.dueDate,
        note: `Renovado via API · ${option.label} · vence ${formatBrDate(updated.dueDate)}`,
      });
      persistJobs(nextJobs);
      toast.success(
        `Renovado: ${item.name} · vence ${formatBrDate(updated.dueDate)}`,
      );
      await sendRenewalReceipt(
        updated.phone || item.phone || "",
        updated.itemId.trim(),
        updated.dueDate,
      );
    } catch (e) {
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "failed",
        note: e instanceof Error ? e.message : "erro",
      });
      persistJobs(nextJobs);
      toast.error(e instanceof Error ? e.message : "Falha na renovação");
    } finally {
      setBusyId(null);
    }
  };

  const lookupIptvPassword = async (
    username?: string,
    opts?: { silent?: boolean },
  ) => {
    const want = (username ?? appUsername).trim();
    if (!want) {
      if (!opts?.silent) toast.error("Informe o usuário IPTV");
      return false;
    }
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) {
      if (!opts?.silent) {
        toast.error("Salve o token ou usuário/senha do painel antes");
      }
      return false;
    }
    setLookingUpPass(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const remote = await findIptvUserByUsername(creds, want);
      if (!remote) {
        if (!opts?.silent) {
          toast.error("Usuário não encontrado no painel");
        }
        return false;
      }
      if (!remote.password) {
        if (!opts?.silent) {
          toast.error(
            "Painel não retornou a senha desse usuário. Digite manualmente.",
          );
        }
        return false;
      }
      setAppPassword(String(remote.password));
      if (!opts?.silent) toast.success("Senha preenchida do painel");
      return true;
    } catch (e) {
      if (!opts?.silent) {
        toast.error(e instanceof Error ? e.message : "Falha ao buscar senha");
      }
      return false;
    } finally {
      setLookingUpPass(false);
    }
  };

  const loadRegisteredApps = async (
    username: string,
    opts?: { silent?: boolean },
  ) => {
    const want = username.trim();
    if (!want) {
      setRegisteredApps([]);
      return;
    }
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) {
      if (!opts?.silent) toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    setLoadingApps(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const rows = await listSmartAppsForUsername(creds, want);
      setRegisteredApps(rows);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
    } catch (e) {
      setRegisteredApps([]);
      if (!opts?.silent) {
        toast.error(
          e instanceof Error ? e.message : "Falha ao listar apps cadastrados",
        );
      }
    } finally {
      setLoadingApps(false);
    }
  };

  const runDeleteSmartApp = async (entry: SmartAppEntry) => {
    const device = entry.mac || entry.idDevice || String(entry.id);
    const isLocal = entry.localOnly || String(entry.id).startsWith("local:");
    if (
      !window.confirm(
        isLocal
          ? `Remover ${entry.appLabel} (${device}) da lista deste usuário?`
          : `Excluir ${entry.appLabel} (${device}) deste usuário no painel?`,
      )
    ) {
      return;
    }
    setDeletingAppId(entry.id);
    try {
      if (isLocal) {
        removeLocalPartnerApp(entry.id);
        setRegisteredApps((prev) => prev.filter((r) => r.id !== entry.id));
        toast.success("Removido da lista");
        return;
      }
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      await deleteSmartApp(creds, entry.id);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      setRegisteredApps((prev) => prev.filter((r) => r.id !== entry.id));
      toast.success("App/MAC removido do painel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setDeletingAppId(null);
    }
  };

  const clearActivateApp = () => {
    setAppUsername("");
    setAppPassword("");
    setAppNickname("");
    setAppDevice("");
    setRegisteredApps([]);
    setShowAppPass(false);
  };

  const fillActivateFromClient = (itemId: string) => {
    const item = clients.find((i) => i.id === itemId);
    if (!item) return;
    const userLogin = item.itemId?.trim() || "";
    setAppUsername(userLogin);
    setAppPassword("");
    setAppNickname("");
    setAppDevice("");
    if (userLogin) {
      void loadRegisteredApps(userLogin, { silent: true });
      void lookupIptvPassword(userLogin, { silent: true });
    } else {
      setRegisteredApps([]);
      toast.error("Cliente sem usuário IPTV cadastrado");
    }
  };

  // Ao digitar/colar o usuário IPTV, busca a senha sozinho
  useEffect(() => {
    const want = appUsername.trim();
    if (want.length < 3) return;
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) return;
    const t = window.setTimeout(() => {
      void lookupIptvPassword(want, { silent: true });
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao usuário digitado
  }, [appUsername]);

  const runActivateApp = async () => {
    if (!appUsername.trim() || !appPassword || !appDevice.trim()) {
      toast.error("Preencha usuário IPTV, senha e MAC/Device ID");
      return;
    }
    setActivatingApp(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      await activatePartnerApp(creds, {
        app: appId,
        username: appUsername,
        password: appPassword,
        device: appDevice,
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      const remembered = rememberPartnerAppActivation({
        app: appId,
        username: appUsername,
        device: appDevice,
        nickname: appNickname,
      });
      const label = PARTNER_APPS.find((a) => a.id === appId)?.label || appId;
      const nick = remembered.nickname?.trim();
      toast.success(
        nick
          ? `${label} ativado · ${nick}`
          : `${label} ativado para ${appUsername.trim()}`,
      );
      setRegisteredApps((prev) => {
        const rest = prev.filter((r) => r.id !== remembered.id);
        return [remembered, ...rest];
      });
      setAppNickname("");
      void loadRegisteredApps(appUsername, { silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar app");
    } finally {
      setActivatingApp(false);
    }
  };

  const saveEntryNickname = (entry: SmartAppEntry, nickname: string) => {
    const clean = setDeviceNickname(
      entry.username || appUsername,
      entry.mac,
      entry.idDevice,
      nickname,
    );
    setRegisteredApps((prev) =>
      prev.map((r) =>
        r.id === entry.id ? { ...r, nickname: clean } : r,
      ),
    );
  };

  const openTestDialog = (prefillNota?: string) => {
    setTestNota(prefillNota?.trim() || "");
    setTestHoursPick(testHours || 6);
    setTestDialogOpen(true);
  };

  const copyField = async (label: string, value: string) => {
    if (!value.trim()) {
      toast.error(`${label} indisponível`);
      return;
    }
    const ok = await copyText(value);
    if (ok) toast.success(`${label} copiado`);
    else toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
  };

  const refreshPanelTests = async () => {
    const canReach =
      Boolean(bearer.trim()) || Boolean(panelUser.trim() && panelPass);
    if (!canReach) {
      toast.error("Conecte a conta UniPlay antes");
      return;
    }
    setSyncingTests(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const users = await listIptvUsers(creds);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      const result = mergePanelTestsIntoJobs(loadIptvJobs(user.id), users, {
        m3uHost: platform.m3uHost,
        dnsFallback: platform.dnsSmarters,
      });
      persistJobs(result.jobs);
      const parts = [
        result.created ? `${result.created} novo(s)` : "",
        result.updated ? `${result.updated} atualizado(s)` : "",
        result.removed ? `${result.removed} removido(s)` : "",
      ].filter(Boolean);
      toast.success(
        parts.length
          ? `Testes UniPlay: ${parts.join(" · ")}`
          : "Nenhum teste na lista da UniPlay",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Falha ao atualizar testes",
      );
    } finally {
      setSyncingTests(false);
    }
  };

  const runApiTest = async (hours: number, notaRaw?: string) => {
    if (!bearer.trim()) {
      toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    const hoursSafe = Math.max(1, Math.min(6, hours || 6));
    const nota = (notaRaw ?? testNota).trim();
    setTestHours(hoursSafe);
    setTestDialogOpen(false);
    const job = createIptvJob({
      kind: "test",
      status: "doing",
      itemRefId: "",
      clientName: nota || "Teste avulso",
      panelUsername: "",
      phone: "",
      dueDate: null,
      months: renewMonths,
      testHours: hoursSafe,
      note: `API · teste avulso ${hoursSafe}h${nota ? ` · ${nota}` : ""}`,
    });
    let nextJobs = [job, ...jobs];
    persistJobs(nextJobs);
    setBusyId(job.id);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      // Avulso: painel gera usuário/senha novos; nota opcional
      const result = await createIptvTest(creds, {
        testHours: hoursSafe,
        packageId: platform.packageId,
        nota: nota || undefined,
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);

      let access = result;
      if (
        (!access.m3u || !access.dnsSmarters || !access.dueDate) &&
        access.username
      ) {
        try {
          const remote = await findIptvUserByUsername(creds, access.username);
          if (remote) {
            const row = remote as Record<string, unknown>;
            access = {
              ...access,
              m3u:
                access.m3u ||
                (typeof row.m3u === "string" ? row.m3u : undefined) ||
                (typeof row.url_m3u === "string" ? row.url_m3u : undefined),
              dnsSmarters:
                access.dnsSmarters ||
                (typeof row.dns === "string" ? row.dns : undefined) ||
                (typeof row.server === "string" ? row.server : undefined) ||
                (typeof row.url === "string" ? row.url : undefined),
              password:
                access.password ||
                (typeof row.password === "string" ? row.password : undefined),
              dueDate:
                access.dueDate ||
                (typeof row.exp_date === "string" ? row.exp_date : undefined) ||
                (typeof row.expDate === "string" ? row.expDate : undefined),
            };
            access = enrichCreateTestResult({ ...access, raw: remote });
          }
        } catch {
          /* ignore */
        }
      }

      const createdUser = access.username || "";
      let password = access.password?.trim() || "";
      // Último recurso: busca senha na ficha do painel
      if (!password && createdUser) {
        try {
          password = (await fetchIptvUserPassword(creds, createdUser)) || "";
        } catch {
          /* ignore */
        }
      }
      const links = resolveTestAccessLinks({
        username: createdUser,
        password,
        m3u: access.m3u,
        dnsSmarters: access.dnsSmarters,
        m3uHost: platform.m3uHost,
        dnsFallback: platform.dnsSmarters,
      });
      const testDue = access.dueDate || null;
      setLastTest({
        jobId: job.id,
        username: createdUser,
        password,
        m3u: links.m3u,
        dnsSmarters: links.dnsSmarters,
        clientName: nota || "Teste avulso",
        hours: hoursSafe,
        dueDate: testDue,
      });
      let remoteId = access.remoteId;
      if ((remoteId == null || remoteId === "") && createdUser) {
        try {
          const remote = await findIptvUserByUsername(creds, createdUser, {
            exactOnly: true,
          });
          remoteId = remote?.id;
        } catch {
          /* ignore */
        }
      }
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "done",
        panelUsername: createdUser || job.panelUsername,
        panelRemoteId: remoteId,
        panelPassword: password || undefined,
        m3u: links.m3u || undefined,
        dnsSmarters: links.dnsSmarters || undefined,
        dueDate: testDue,
        note: createdUser
          ? `Teste OK · ${createdUser}${password ? ` / ${password}` : ""} · ${hoursSafe}h`
          : access.message || "Teste criado via API",
      });
      persistJobs(nextJobs);
      setDetailJobId(job.id);
      toast.success(
        createdUser
          ? `Teste avulso de ${hoursSafe}h criado: ${createdUser}`
          : `Teste avulso de ${hoursSafe}h criado`,
      );
    } catch (e) {
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "failed",
        note: e instanceof Error ? e.message : "erro",
      });
      persistJobs(nextJobs);
      toast.error(e instanceof Error ? e.message : "Falha ao gerar teste");
    } finally {
      setBusyId(null);
    }
  };

  const startInPanel = async (job: IptvJob) => {
    setBusyId(job.id);
    try {
      const ok = await copyText(job.panelUsername);
      openPanel();
      persistJobs(
        patchIptvJob(jobs, job.id, {
          status: "doing",
        }),
      );
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

  const openTestDetail = (job: IptvJob) => {
    if (job.kind !== "test") return;
    setActivateOption(IPTV_RENEW_OPTIONS[0]);
    setDetailJobId(job.id);
    // Testes antigos sem senha/M3U: tenta completar ao abrir o modal
    if (
      job.panelUsername.trim() &&
      (!job.panelPassword?.trim() || !job.m3u?.trim()) &&
      (bearer.trim() || (panelUser.trim() && panelPass))
    ) {
      void (async () => {
        try {
          const ensured = await ensureIptvToken(panelCreds());
          if (ensured.renewed) persistToken(ensured.token);
          const creds = { ...panelCreds(), bearerToken: ensured.token };
          let password = job.panelPassword?.trim() || "";
          if (!password) {
            password =
              (await fetchIptvUserPassword(creds, job.panelUsername.trim())) ||
              "";
          }
          if (!password) return;
          const links = resolveTestAccessLinks({
            username: job.panelUsername,
            password,
            m3u: job.m3u,
            dnsSmarters: job.dnsSmarters,
            m3uHost: platform.m3uHost,
            dnsFallback: platform.dnsSmarters,
          });
          persistJobs(
            patchIptvJob(loadIptvJobs(user.id), job.id, {
              panelPassword: password,
              m3u: links.m3u || job.m3u,
              dnsSmarters: links.dnsSmarters || job.dnsSmarters,
            }),
          );
        } catch {
          /* ignore */
        }
      })();
    }
  };

  const linksForJob = (job: IptvJob) =>
    resolveTestAccessLinks({
      username: job.panelUsername,
      password: job.panelPassword,
      m3u: job.m3u,
      dnsSmarters: job.dnsSmarters,
      m3uHost: platform.m3uHost,
      dnsFallback: platform.dnsSmarters,
    });

  const activateTestJob = async (job: IptvJob, option: IptvRenewOption) => {
    if (!job.panelUsername.trim()) {
      toast.error("Teste sem usuário no painel");
      return;
    }
    if (!bearer.trim()) {
      toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    setActivatingTest(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const remote = await findIptvUserByUsername(
        creds,
        job.panelUsername.trim(),
      );
      if (!remote?.id) {
        throw new Error(`Usuário ${job.panelUsername} não encontrado no painel`);
      }
      await renewIptvUser(creds, remote.id, option);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      let panelExp: string | null | undefined;
      try {
        const after = await findIptvUserByUsername(
          creds,
          job.panelUsername.trim(),
        );
        panelExp = after?.exp_date ?? after?.expDate;
      } catch {
        panelExp = remote.exp_date ?? remote.expDate;
      }
      const dueDate =
        (panelExp ? parseIptvExpToDateTime(panelExp) : null) || job.dueDate;
      persistJobs(
        patchIptvJob(jobs, job.id, {
          dueDate,
          months: option.months,
          note: `Ativado · ${option.label} · vence ${formatBrDate(dueDate)}`,
        }),
      );
      toast.success(
        `Teste ativado: ${option.label} · vence ${formatBrDate(dueDate)}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar teste");
    } finally {
      setActivatingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Painéis e integrações: UniPlay (IPTV) e Winbox (internet)."
      />

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="bg-background/80">
          <TabsTrigger value="painel" className="gap-1.5">
            <MonitorPlay className="h-3.5 w-3.5" />
            UniPlay
          </TabsTrigger>
          <TabsTrigger value="winbox" className="gap-1.5">
            <Cable className="h-3.5 w-3.5" />
            Winbox
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="mt-0 space-y-4">
          <Tabs
            value={uniplayConnected ? uniplaySubTab : "conexao"}
            onValueChange={setUniplaySubTab}
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap bg-background/80">
              {uniplayConnected ? (
                <>
                  <TabsTrigger value="ativos" className="gap-1.5">
                    Ativos
                  </TabsTrigger>
                  <TabsTrigger value="testes" className="gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Testes
                  </TabsTrigger>
                  <TabsTrigger value="renovacoes" className="gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Renovações
                  </TabsTrigger>
                  <TabsTrigger value="conexao" className="gap-1.5">
                    Conexão
                  </TabsTrigger>
                </>
              ) : (
                <TabsTrigger value="conexao" className="gap-1.5">
                  Conexão
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="conexao" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Sua conta
              </h2>
              <span className="truncate text-[11px] text-muted-foreground">
                {tokenInfo}
              </span>
            </div>

            <form onSubmit={onSavePanel} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="iptv-user">
                    Usuário
                  </Label>
                  <Input
                    id="iptv-user"
                    name="uniplay-user"
                    type={hideSensitive ? "password" : "text"}
                    value={panelUser}
                    onChange={(e) => setPanelUser(e.target.value)}
                    placeholder="Login do painel"
                    className="h-9"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    readOnly={hideSensitive}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="iptv-pass">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="iptv-pass"
                      name="uniplay-pass"
                      type={
                        hideSensitive || !showPass ? "password" : "text"
                      }
                      value={panelPass}
                      onChange={(e) => setPanelPass(e.target.value)}
                      placeholder="Senha da UniPlay"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className="h-9 pr-9"
                      readOnly={hideSensitive}
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                      onClick={() => setShowPass((v) => !v)}
                      disabled={hideSensitive}
                      aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPass && !hideSensitive ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9"
                  disabled={
                    refreshingToken || !panelUser.trim() || !panelPass
                  }
                  onClick={() => void refreshTokenNow()}
                >
                  {refreshingToken ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Conectar
                </Button>
                <Button type="submit" size="sm" className="h-9" disabled={saving}>
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "…" : "Salvar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={openPanel}
                  disabled={!(platform.panelUrl.trim() || DEFAULT_IPTV_PANEL_URL)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Painel
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pasta para sincronizar</Label>
                <Select
                  value={syncFolderId || "__none__"}
                  onValueChange={(v) => {
                    const nextId = v === "__none__" ? "" : v;
                    setSyncFolderId(nextId);
                    // Só grava qual pasta tem o botão — não sincroniza nada
                    if (!user) return;
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, syncFolderId: nextId };
                    saveAutomationsConfig(user.id, next);
                    setConfig(next);
                    toast.message(
                      nextId
                        ? "Botão Sincronizar UniPlay liberado nessa pasta"
                        : "Botão de sincronizar removido",
                    );
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Escolha a pasta de clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {clientFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Só escolhe onde o botão aparece. A sincronização só roda quando
                  você apertar o botão na pasta.
                </p>
              </div>
            </form>
          </section>
            </TabsContent>

            {uniplayConnected ? (
              <>
            <TabsContent value="ativos" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <h2 className="text-sm font-semibold tracking-tight">Clientes</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="h-11 border-primary/35 bg-primary/[0.06] pl-9 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)] placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-primary/25"
                value={q}
                onChange={(e) => {
                  const next = e.target.value;
                  setQ(next);
                  if (next.trim().length < 2) clearActivateApp();
                }}
                placeholder="Buscar por nome, usuário ou telefone…"
              />
            </div>

            {q.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">
                Digite ao menos 2 caracteres.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">
                        {item.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {maskUser(item.itemId)}
                        {item.dueDate ? ` · ${formatBrDate(item.dueDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5"
                        disabled={!bearer.trim() || busyId === item.id}
                        onClick={() => openRenewDialog(item.id)}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Renovar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5"
                        disabled={!bearer.trim() || Boolean(busyId)}
                        onClick={() => openTestDialog(item.name)}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Teste
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5"
                        onClick={() => fillActivateFromClient(item.id)}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        App
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Ativar app
              </h2>
              {appUsername.trim() ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={loadingApps || !bearer.trim()}
                  onClick={() => void loadRegisteredApps(appUsername)}
                >
                  {loadingApps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Atualizar
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">App</Label>
                <Select
                  value={appId}
                  onValueChange={(v) => {
                    const next = v as PartnerAppId;
                    setAppId(next);
                    const meta = PARTNER_APPS.find((a) => a.id === next);
                    if (meta?.deviceField === "mac" && appDevice) {
                      setAppDevice(formatMacInput(appDevice));
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="App" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTNER_APPS.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="app-nick">
                  Apelido
                </Label>
                <Input
                  id="app-nick"
                  value={appNickname}
                  onChange={(e) =>
                    setAppNickname(e.target.value.toUpperCase().slice(0, 32))
                  }
                  placeholder="SALA, QUARTO…"
                  className="h-9"
                  autoComplete="off"
                  maxLength={32}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="app-device">
                  {PARTNER_APPS.find((a) => a.id === appId)?.deviceField ===
                  "deviceId"
                    ? "Device ID"
                    : "MAC"}
                </Label>
                <Input
                  id="app-device"
                  value={appDevice}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const isMac =
                      PARTNER_APPS.find((a) => a.id === appId)?.deviceField ===
                      "mac";
                    setAppDevice(isMac ? formatMacInput(raw) : raw);
                  }}
                  placeholder={
                    PARTNER_APPS.find((a) => a.id === appId)?.deviceField ===
                    "mac"
                      ? "aa:bb:cc:dd:ee:ff"
                      : "Device ID"
                  }
                  className="h-9 font-mono text-xs"
                  autoComplete="off"
                  maxLength={
                    PARTNER_APPS.find((a) => a.id === appId)?.deviceField ===
                    "mac"
                      ? 17
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="app-user">
                  Usuário
                </Label>
                <Input
                  id="app-user"
                  type={hideSensitive ? "password" : "text"}
                  value={appUsername}
                  onChange={(e) => {
                    setAppUsername(e.target.value);
                    setAppPassword("");
                    setRegisteredApps([]);
                  }}
                  onBlur={() => {
                    if (appUsername.trim().length >= 3) {
                      void lookupIptvPassword(appUsername, { silent: true });
                    }
                  }}
                  placeholder="Login IPTV"
                  className="h-9"
                  autoComplete="off"
                  readOnly={hideSensitive}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="app-pass">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="app-pass"
                    type={
                      hideSensitive || !showAppPass ? "password" : "text"
                    }
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder={
                      lookingUpPass ? "Buscando…" : "Preenche sozinha"
                    }
                    className="h-9 pr-9"
                    autoComplete="off"
                    readOnly={hideSensitive}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                    onClick={() => setShowAppPass((v) => !v)}
                    disabled={hideSensitive}
                    aria-label={showAppPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {lookingUpPass ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : showAppPass && !hideSensitive ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={activatingApp || lookingUpPass || !bearer.trim()}
              onClick={() => void runActivateApp()}
            >
              {activatingApp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              Ativar
            </Button>

            {appUsername.trim() ? (
              loadingApps ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando aparelhos…
                </p>
              ) : registeredApps.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {registeredApps.map((entry) => (
                    <li
                      key={String(entry.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-sm"
                    >
                      <Input
                        value={entry.nickname || ""}
                        onChange={(e) =>
                          saveEntryNickname(
                            entry,
                            e.target.value.toUpperCase().slice(0, 32),
                          )
                        }
                        placeholder="Apelido"
                        className="h-8 w-[7.5rem] shrink-0 text-xs font-medium"
                        maxLength={32}
                      />
                      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        <span className="text-foreground/80">
                          {entry.appLabel}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span className="font-mono">
                          {entry.mac || entry.idDevice || "—"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        disabled={deletingAppId === entry.id}
                        onClick={() => void runDeleteSmartApp(entry)}
                        aria-label="Excluir"
                      >
                        {deletingAppId === entry.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhum aparelho cadastrado neste usuário.
                </p>
              )
            ) : null}
          </section>
            </TabsContent>

            <TabsContent value="testes" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">Testes</h2>
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8"
                disabled={
                  (!bearer.trim() && !(panelUser.trim() && panelPass)) ||
                  Boolean(busyId) ||
                  syncingTests
                }
                onClick={() => openTestDialog()}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Gerar teste
              </Button>
            </div>
            {lastTest ? (
              <button
                type="button"
                className="w-full rounded-md border border-success/30 bg-success/5 px-3 py-2.5 text-left transition hover:bg-success/10"
                onClick={() => {
                  const job = jobs.find((j) => j.id === lastTest.jobId);
                  if (job) openTestDetail(job);
                  else setDetailJobId(lastTest.jobId);
                }}
              >
                <p className="text-xs font-medium text-foreground">
                  Teste gerado · {lastTest.clientName} · {lastTest.hours}h
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {maskUser(lastTest.username)}
                  {lastTest.dueDate
                    ? ` · vence ${formatBrDate(lastTest.dueDate)}`
                    : ""}
                </p>
                <p className="mt-1 text-[11px] text-primary">
                  Toque para ver usuário, senha, M3U, DNS e ativar
                </p>
              </button>
            ) : null}
          </section>

          <section className="ax-surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Fila</h2>
                  <p className="text-xs text-muted-foreground">
                    {openTestJobs.length} em aberto
                    {testJobsCount > 0 ? ` · ${testJobsCount} teste(s)` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    disabled={
                      (!bearer.trim() && !(panelUser.trim() && panelPass)) ||
                      syncingTests ||
                      Boolean(busyId)
                    }
                    onClick={() => void refreshPanelTests()}
                  >
                    {syncingTests ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Atualizar testes
                  </Button>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={jobsQ}
                  onChange={(e) => setJobsQ(e.target.value)}
                  placeholder="Buscar teste (nome, usuário…)"
                  className="h-9 pl-8"
                />
              </div>

              {openTestJobs.length > 0 ? (
                <ul className="space-y-1.5">
                  {openTestJobs.map((job) => (
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
                            {maskUser(job.panelUsername)}
                            {` · ${job.testHours}h`}
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
                          Teste · {statusLabel(job.status)}
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
              ) : null}

              {recentTestJobs.length > 0 ? (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Recentes
                  </p>
                  <ul className="space-y-1">
                    {recentTestJobs.map((job) => (
                      <li
                        key={job.id}
                        className="text-[11px] text-muted-foreground"
                      >
                        <button
                          type="button"
                          className="min-w-0 w-full truncate text-left hover:text-foreground"
                          onClick={() => openTestDetail(job)}
                        >
                          {job.clientName} · teste
                          {job.panelUsername
                            ? ` · ${maskUser(job.panelUsername)}`
                            : ""}
                          {" · "}
                          {job.dueDate
                            ? formatBrDate(job.dueDate)
                            : format(
                                new Date(job.updatedAt),
                                "dd/MM/yyyy HH:mm:ss",
                              )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {openTestJobs.length === 0 && recentTestJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {jobsQ.trim()
                    ? "Nenhum resultado para essa busca."
                    : "Nenhum teste na fila. Use Atualizar testes para carregar da UniPlay."}
                </p>
              ) : null}
            </section>
            </TabsContent>

            <TabsContent value="renovacoes" className="mt-0 space-y-4">
              <section className="ax-surface space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Log de renovações
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Histórico das renovações feitas pelo AuxPlus
                      {renewLogCount > 0 ? ` · ${renewLogCount} registro(s)` : ""}
                    </p>
                  </div>
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
                                {maskUser(job.panelUsername)}
                                {` · +${job.months}m`}
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
                              Renovação · {statusLabel(job.status)}
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
                  <ul className="divide-y rounded-md border">
                    {renewLog.map((job) => (
                      <li
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-tight">
                            {job.clientName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {maskUser(job.panelUsername)}
                            {` · +${job.months}m`}
                            {job.dueDate
                              ? ` · vence ${formatBrDate(job.dueDate)}`
                              : ""}
                            {" · "}
                            {format(
                              new Date(job.updatedAt),
                              "dd/MM/yyyy HH:mm",
                            )}
                          </p>
                          {job.note ? (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                              {job.note}
                            </p>
                          ) : null}
                        </div>
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
                          {statusLabel(job.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {openRenewJobs.length === 0 && renewLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {renewQ.trim()
                      ? "Nenhum resultado para essa busca."
                      : "Nenhuma renovação registrada ainda. Use Renovar em Ativos."}
                  </p>
                ) : null}
              </section>
            </TabsContent>
              </>
            ) : null}
          </Tabs>
        </TabsContent>

        <TabsContent value="winbox" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-5">
            <div className="flex items-start gap-2">
              <Cable className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold tracking-tight">
                  Winbox / PPPoE
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Em breve: liberação automática via API do RouterOS (MikroTik)
                  para PPPoE dos clientes de internet.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!renewTargetId}
        onOpenChange={(open) => {
          if (!open) setRenewTargetId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovação UniPlay</DialogTitle>
            <DialogDescription>
              {renewTargetId
                ? (() => {
                    const item = clients.find((i) => i.id === renewTargetId);
                    return item
                      ? `${item.name} · ${maskUser(item.itemId) === "—" ? "sem usuário" : maskUser(item.itemId)}`
                      : "Escolha o plano";
                  })()
                : "Escolha o plano"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            {IPTV_RENEW_OPTIONS.map((opt) => {
              const selected = renewOption.months === opt.months;
              return (
                <button
                  key={opt.months}
                  type="button"
                  onClick={() => setRenewOption(opt)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition",
                    selected
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenewTargetId(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!renewTargetId || busyId === renewTargetId}
              onClick={() => {
                if (!renewTargetId) return;
                void runApiRenew(renewTargetId, renewOption);
              }}
            >
              {busyId && busyId === renewTargetId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Confirmar renovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar teste avulso</DialogTitle>
            <DialogDescription>
              Cria um usuário novo no painel (1–6 horas). Não vincula a cliente
              existente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="test-nota" className="text-xs">
              Nota (nome no painel)
            </Label>
            <Input
              id="test-nota"
              value={testNota}
              onChange={(e) => setTestNota(e.target.value)}
              placeholder="Nome do teste"
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5 py-1">
            {IPTV_TEST_HOURS.map((h) => {
              const selected = testHoursPick === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setTestHoursPick(h)}
                  className={cn(
                    "rounded-md border px-2 py-2.5 text-sm transition",
                    selected
                      ? "border-primary bg-primary/10 font-semibold text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {h}h
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTestDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void runApiTest(testHoursPick, testNota)}
            >
              {busyId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              Gerar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailJob}
        onOpenChange={(open) => {
          if (!open) setDetailJobId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {detailJob ? (
            <>
              <DialogHeader>
                <DialogTitle>Detalhes do teste</DialogTitle>
                <DialogDescription>
                  {detailJob.clientName}
                  {detailJob.dueDate
                    ? ` · vence ${formatBrDate(detailJob.dueDate)}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              {(() => {
                const links = linksForJob(detailJob);
                return (
                  <div className="space-y-3">
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 justify-start"
                        onClick={() =>
                          void copyField("Usuário", detailJob.panelUsername)
                        }
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar usuário
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 justify-start"
                        onClick={() =>
                          void copyField(
                            "Senha",
                            detailJob.panelPassword || "",
                          )
                        }
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar senha
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 justify-start"
                        onClick={() => void copyField("Link M3U", links.m3u)}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar link M3U
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-9 justify-start"
                        onClick={() =>
                          void copyField("DNS Smarters", links.dnsSmarters)
                        }
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copiar DNS Smarters
                      </Button>
                    </div>
                    <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      <p>Usuário: {maskUser(detailJob.panelUsername)}</p>
                      <p>
                        Senha:{" "}
                        {hideSensitive
                          ? "••••••••"
                          : detailJob.panelPassword || "—"}
                      </p>
                      <p className="break-all">
                        M3U:{" "}
                        {hideSensitive ? "••••••••" : links.m3u || "—"}
                      </p>
                      <p>
                        DNS:{" "}
                        {hideSensitive
                          ? "••••••••"
                          : links.dnsSmarters || "—"}
                      </p>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">
                        Ativar com créditos (mensalidade)
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Converte o teste em plano pago no painel, cobrando os
                        créditos do plano escolhido.
                      </p>
                      <div className="space-y-1.5">
                        {IPTV_RENEW_OPTIONS.map((opt) => {
                          const selected =
                            activateOption.months === opt.months;
                          return (
                            <button
                              key={opt.months}
                              type="button"
                              onClick={() => setActivateOption(opt)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                                selected
                                  ? "border-primary bg-primary/10 font-medium text-foreground"
                                  : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                              )}
                            >
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDetailJobId(null)}
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={activatingTest || !detailJob.panelUsername}
                  onClick={() =>
                    void activateTestJob(detailJob, activateOption)
                  }
                >
                  {activatingTest ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Ativar plano
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
