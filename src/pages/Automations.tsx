import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useDialogHistoryBack } from "@/hooks/useDialogHistoryBack";
import { format } from "date-fns";
import {
  Cable,
  CalendarPlus,
  CheckCircle2,
  ClipboardCopy,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  History,
  Loader2,
  MonitorPlay,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
  Users,
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
  isUniplayConnected,
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
  loadIptvJobsRemote,
  mergePanelTestsIntoJobs,
  mergeWhatsAppLogSources,
  nextDueAfterRenew,
  patchIptvJob,
  saveIptvJobs,
  applyResellerRechargeToItem,
  syncIptvResellersToFolder,
  type IptvJob,
} from "@/lib/iptvAutomation";
import {
  loadMpOrdersRemote,
} from "@/lib/mercadoPagoOrders";
import { loadWaBotStateRemote } from "@/lib/whatsappBotConfig";
import {
  notifyUniplayCreditsChanged,
  onUniplayCreditsChanged,
} from "@/lib/uniplayCreditsSync";
import {
  activatePartnerApp,
  addIptvResellerCredits,
  resolveIptvResellerPanelId,
  buildRenewalReceiptMessage,
  createIptvTest,
  deleteSmartApp,
  ensureIptvToken,
  fetchIptvPanelCredits,
  fetchIptvUserPassword,
  findIptvUserByUsername,
  formatIptvCredits,
  formatMacInput,
  macCaretAfterHex,
  macHexDigits,
  getLastIssuedIptvToken,
  enrichCreateTestResult,
  IPTV_RENEW_OPTIONS,
  IPTV_RESELLER_CREDITS_MIN,
  IPTV_TEST_HOURS,
  listIptvResellers,
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
  type IptvReseller,
  type PartnerAppId,
  type SmartAppEntry,
} from "@/lib/iptvPanelApi";
import {
  fetchEvolutionStatus,
  sendEvolutionText,
} from "@/lib/whatsappAutomation";
import {
  assertMpAccessToken,
  pingMercadoPago,
} from "@/lib/mercadoPagoApi";
import { openPanelWindow } from "@/lib/panelKeepAlive";
import { SUPABASE_URL } from "@/integrations/supabase/client";
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
  const {
    hidden: hideSensitive,
    user: maskUser,
    num: maskNum,
  } = useHideBalance();
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
  const [syncResellersFolderId, setSyncResellersFolderId] = useState(
    config.syncResellersFolderId,
  );
  const [resellers, setResellers] = useState<IptvReseller[]>([]);
  const [loadingResellers, setLoadingResellers] = useState(false);
  const [syncingResellers, setSyncingResellers] = useState(false);
  const [resellersQ, setResellersQ] = useState("");
  const [creditTarget, setCreditTarget] = useState<IptvReseller | null>(null);
  const [creditAmount, setCreditAmount] = useState(String(IPTV_RESELLER_CREDITS_MIN));
  const [addingCredits, setAddingCredits] = useState(false);
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
  const [testLogQ, setTestLogQ] = useState("");
  const [uniplaySubTab, setUniplaySubTab] = useState("conexao");
  const [logsSubTab, setLogsSubTab] = useState("renovacoes");
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);
  const [clientDetailAccess, setClientDetailAccess] = useState<{
    password: string;
    m3u: string;
    dnsSmarters: string;
  } | null>(null);
  const [showClientsList, setShowClientsList] = useState(false);
  const [showTestsList, setShowTestsList] = useState(false);
  const [renewTargetJobId, setRenewTargetJobId] = useState<string | null>(null);
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
  type ActivateAppScope = "clientes" | "testes";
  type ActivateAppForm = {
    appId: PartnerAppId;
    username: string;
    password: string;
    device: string;
    nickname: string;
    showPass: boolean;
    registered: SmartAppEntry[];
  };
  const emptyActivateForm = (): ActivateAppForm => ({
    appId: "prime",
    username: "",
    password: "",
    device: "",
    nickname: "",
    showPass: false,
    registered: [],
  });
  const [activateForms, setActivateForms] = useState<
    Record<ActivateAppScope, ActivateAppForm>
  >({
    clientes: emptyActivateForm(),
    testes: emptyActivateForm(),
  });
  const [activatingAppScope, setActivatingAppScope] =
    useState<ActivateAppScope | null>(null);
  const [lookingUpPassScope, setLookingUpPassScope] =
    useState<ActivateAppScope | null>(null);
  const [loadingAppsScope, setLoadingAppsScope] =
    useState<ActivateAppScope | null>(null);
  const [deletingAppId, setDeletingAppId] = useState<string | number | null>(
    null,
  );
  const patchActivateForm = (
    scope: ActivateAppScope,
    patch: Partial<ActivateAppForm>,
  ) => {
    setActivateForms((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], ...patch },
    }));
  };
  const [mpAccessToken, setMpAccessToken] = useState(config.mpAccessToken);
  const [mpPayerEmail, setMpPayerEmail] = useState(config.mpPayerEmail);
  const [resellerCreditPriceBrl, setResellerCreditPriceBrl] = useState(
    config.resellerCreditPriceBrl,
  );
  const [showMpToken, setShowMpToken] = useState(false);
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [panelCredits, setPanelCredits] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  useEffect(() => {
    if (!user) return;
    setJobs(loadIptvJobs(user.id));
    void (async () => {
      const [remoteJobs, waState, mpOrders, autoCfg] = await Promise.all([
        loadIptvJobsRemote(user.id),
        loadWaBotStateRemote(user.id),
        loadMpOrdersRemote(user.id),
        loadAutomationsConfigRemote(user.id),
      ]);
      const merged = mergeWhatsAppLogSources(remoteJobs, {
        testConsumed: waState.testConsumed,
        mpOrders,
        testHours: autoCfg.testHours || testHours,
      });
      setJobs(merged);
      if (merged.length !== remoteJobs.length) {
        saveIptvJobs(user.id, merged);
      }
    })();
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
      setSyncResellersFolderId(next.syncResellersFolderId);
      setMpAccessToken(next.mpAccessToken);
      setMpPayerEmail(next.mpPayerEmail);
      setResellerCreditPriceBrl(next.resellerCreditPriceBrl);
    });
  }, [user]);

  const uniplayConnected = useMemo(
    () =>
      isUniplayConnected({
        iptvBearerToken: bearer,
        iptvUsername: panelUser,
        iptvPassword: panelPass,
      }),
    [bearer, panelUser, panelPass],
  );

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
      setResellers([]);
      return;
    }
    // Ao conectar, abre Ativos (Conexão fica como 3ª aba)
    setUniplaySubTab((tab) => (tab === "conexao" ? "ativos" : tab));
  }, [uniplayConnected]);

  const uniplayPrefetchKey = useRef("");
  // Prefetch contagens ao abrir UniPlay (não precisa entrar em cada aba)
  useEffect(() => {
    if (!uniplayConnected || !user) {
      uniplayPrefetchKey.current = "";
      return;
    }
    const canReach =
      Boolean(bearer.trim()) || Boolean(panelUser.trim() && panelPass);
    if (!canReach) return;

    // Uma vez por sessão conectada (evita rebuscar a cada refresh de token)
    const key = `${user.id}|${panelUser.trim()}|${platform.apiBaseUrl || config.iptvApiBaseUrl}`;
    if (uniplayPrefetchKey.current === key) return;

    let cancelled = false;

    const credsBase = (): IptvPanelCreds => ({
      apiBaseUrl: platform.apiBaseUrl || config.iptvApiBaseUrl,
      bearerToken: bearer.trim(),
      regPassword: platform.regPassword.trim() || undefined,
      defaultPackage: platform.packageId.trim() || "1",
      username: panelUser.trim() || undefined,
      password: panelPass || undefined,
      apiProxyUrl: platform.apiProxyUrl?.trim() || undefined,
    });

    void (async () => {
      setLoadingResellers(true);
      try {
        const ensured = await ensureIptvToken(credsBase());
        const tokenCreds = {
          ...credsBase(),
          bearerToken: ensured.token,
        };

        const [rows, users] = await Promise.all([
          listIptvResellers(tokenCreds),
          listIptvUsers(tokenCreds),
        ]);
        if (cancelled) return;

        setResellers(rows);

        const result = mergePanelTestsIntoJobs(loadIptvJobs(user.id), users, {
          m3uHost: platform.m3uHost,
          dnsFallback: platform.dnsSmarters,
        });
        setJobs(result.jobs);
        saveIptvJobs(user.id, result.jobs);
        uniplayPrefetchKey.current = key;
      } catch {
        /* silencioso — tenta de novo se credenciais mudarem */
      } finally {
        if (!cancelled) setLoadingResellers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    uniplayConnected,
    user,
    panelUser,
    panelPass,
    bearer,
    platform.apiBaseUrl,
    platform.apiProxyUrl,
    platform.regPassword,
    platform.packageId,
    platform.m3uHost,
    platform.dnsSmarters,
    config.iptvApiBaseUrl,
  ]);

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

  /** Ativos: Longe / Perto de vencer (vencidos ficam de fora) */
  const activeClients = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.status === "Longe de Vencer" || c.status === "Perto de Vencer",
      ),
    [clients],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Oculto por padrão; busca (≥2) ou "Mostrar lista" revela
    if (!showClientsList && term.length < 2) return [];
    const rank = (status?: string | null) => {
      if (status === "Perto de Vencer") return 0;
      if (status === "Longe de Vencer") return 1;
      return 2;
    };
    return activeClients
      .filter((i) => {
        if (term.length < 2) return true;
        return (
          i.name.toLowerCase().includes(term) ||
          i.itemId.toLowerCase().includes(term) ||
          (i.phone || "").includes(term)
        );
      })
      .sort((a, b) => {
        const rs = rank(a.status) - rank(b.status);
        if (rs !== 0) return rs;
        const da = a.dueDate || "9999-99-99";
        const db = b.dueDate || "9999-99-99";
        return da.localeCompare(db);
      })
      .slice(0, showClientsList && term.length < 2 ? 100 : 50);
  }, [activeClients, q, showClientsList]);

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

  /** Oculto por padrão; busca (≥2) ou "Mostrar lista" revela */
  const filteredTests = useMemo(() => {
    const term = jobsQ.trim().toLowerCase();
    if (!showTestsList && term.length < 2) return [];
    return jobs
      .filter(
        (j) =>
          j.kind === "test" &&
          (term.length < 2 || jobMatchesQuery(j, jobsQ)),
      )
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, showTestsList && term.length < 2 ? 100 : 50);
  }, [jobs, jobsQ, showTestsList]);
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
  const testLog = useMemo(() => {
    const list = jobs
      .filter((j) => j.kind === "test" && jobMatchesQuery(j, testLogQ))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list.slice(0, testLogQ.trim() ? 300 : 200);
  }, [jobs, testLogQ]);
  const testLogCount = useMemo(
    () => jobs.filter((j) => j.kind === "test").length,
    [jobs],
  );
  const testJobsCount = useMemo(
    () => jobs.filter((j) => j.kind === "test").length,
    [jobs],
  );
  const renewLogCount = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === "renew" && (j.status === "done" || j.status === "failed"),
      ).length,
    [jobs],
  );

  const detailJob = useMemo(
    () => (detailJobId ? jobs.find((j) => j.id === detailJobId) || null : null),
    [detailJobId, jobs],
  );
  const detailClient = useMemo(
    () =>
      detailClientId
        ? clients.find((c) => c.id === detailClientId) || null
        : null,
    [detailClientId, clients],
  );

  useDialogHistoryBack(!!detailJob, () => setDetailJobId(null), "test-detail");
  useDialogHistoryBack(
    !!detailClient,
    () => setDetailClientId(null),
    "client-detail",
  );
  useDialogHistoryBack(
    !!renewTargetId || !!renewTargetJobId,
    () => {
      setRenewTargetId(null);
      setRenewTargetJobId(null);
    },
    "renew-dialog",
  );
  useDialogHistoryBack(
    testDialogOpen,
    () => setTestDialogOpen(false),
    "test-create",
  );
  useDialogHistoryBack(
    !!creditTarget,
    () => setCreditTarget(null),
    "credits-dialog",
  );

  useEffect(() => {
    if (!uniplayConnected || !user) {
      setPanelCredits(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingCredits(true);
      try {
        const creds: IptvPanelCreds = {
          apiBaseUrl: platform.apiBaseUrl || config.iptvApiBaseUrl,
          bearerToken: bearer.trim(),
          regPassword: platform.regPassword.trim() || undefined,
          defaultPackage: platform.packageId.trim() || "1",
          username: panelUser.trim() || undefined,
          password: panelPass || undefined,
          apiProxyUrl: platform.apiProxyUrl?.trim() || undefined,
        };
        const ensured = await ensureIptvToken(creds);
        if (ensured.renewed && user) {
          setBearer(ensured.token);
          const cur = loadAutomationsConfig(user.id);
          saveAutomationsConfig(user.id, {
            ...cur,
            iptvBearerToken: ensured.token,
          });
          setConfig((c) => ({ ...c, iptvBearerToken: ensured.token }));
        }
        const bal = await fetchIptvPanelCredits({
          ...creds,
          bearerToken: ensured.token,
        });
        if (!cancelled) setPanelCredits(bal.credits);
      } catch {
        /* silencioso — badge some se falhar */
      } finally {
        if (!cancelled) setLoadingCredits(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    const offCredits = onUniplayCreditsChanged(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      offCredits();
    };
  }, [
    uniplayConnected,
    user,
    bearer,
    platform.apiBaseUrl,
    platform.apiProxyUrl,
    platform.regPassword,
    platform.packageId,
    config.iptvApiBaseUrl,
    panelUser,
    panelPass,
  ]);

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

  const refreshPanelCredits = async (silent = true) => {
    if (!uniplayConnected) {
      setPanelCredits(null);
      return;
    }
    setLoadingCredits(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const bal = await fetchIptvPanelCredits({
        ...panelCreds(),
        bearerToken: ensured.token,
      });
      setPanelCredits(bal.credits);
    } catch (e) {
      if (!silent) {
        toast.error(
          e instanceof Error ? e.message : "Não foi possível ler os créditos",
        );
      }
    } finally {
      setLoadingCredits(false);
    }
  };

  const refreshResellers = async (silent = false) => {
    if (!uniplayConnected) {
      setResellers([]);
      return;
    }
    setLoadingResellers(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const rows = await listIptvResellers({
        ...panelCreds(),
        bearerToken: ensured.token,
      });
      setResellers(rows);
      if (!silent) {
        toast.success(
          rows.length
            ? `${rows.length} revendedor(es) no painel`
            : "Nenhum revendedor encontrado",
        );
      }
    } catch (e) {
      if (!silent) {
        toast.error(
          e instanceof Error ? e.message : "Falha ao listar revendedores",
        );
      }
    } finally {
      setLoadingResellers(false);
    }
  };

  const syncResellersNow = async () => {
    if (!syncResellersFolderId) {
      toast.error("Escolha a pasta de revendedores em Conexão");
      return;
    }
    setSyncingResellers(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const rows = await listIptvResellers({
        ...panelCreds(),
        bearerToken: ensured.token,
      });
      setResellers(rows);
      let created = 0;
      let updated = 0;
      let skipped = 0;
      setData((prev) => {
        const result = syncIptvResellersToFolder(
          prev,
          syncResellersFolderId,
          rows,
        );
        created = result.created;
        updated = result.updated;
        skipped = result.skipped;
        return result.data;
      });
      toast.success(
        `Revendedores: ${updated} atualizado(s) · ${created} novo(s)` +
          (skipped ? ` · ${skipped} sem mudança` : ""),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Falha ao sincronizar revendedores",
      );
    } finally {
      setSyncingResellers(false);
    }
  };

  const openAddCredits = (reseller: IptvReseller) => {
    setCreditTarget(reseller);
    setCreditAmount(String(IPTV_RESELLER_CREDITS_MIN));
  };

  const creditAmountNum = Math.floor(Number(creditAmount));
  const creditAmountValid =
    Number.isFinite(creditAmountNum) &&
    creditAmountNum >= IPTV_RESELLER_CREDITS_MIN;

  const submitAddCredits = async () => {
    if (!creditTarget) return;
    const amount = Math.floor(Number(creditAmount));
    if (!Number.isFinite(amount) || amount < IPTV_RESELLER_CREDITS_MIN) {
      toast.error(
        `Na UniPlay só é permitido a partir de ${IPTV_RESELLER_CREDITS_MIN} créditos.`,
      );
      setCreditAmount(String(IPTV_RESELLER_CREDITS_MIN));
      return;
    }
    if (
      typeof panelCredits === "number" &&
      Number.isFinite(panelCredits) &&
      amount > panelCredits
    ) {
      toast.error(
        `Saldo insuficiente. Você tem ${formatIptvCredits(panelCredits)} crédito(s).`,
      );
      return;
    }
    setAddingCredits(true);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const resellerId = resolveIptvResellerPanelId(creditTarget);
      if (resellerId == null) {
        toast.error(
          "Revendedor sem ID numérico no UniPlay. Atualize a lista e tente de novo.",
        );
        return;
      }
      const unit = Math.max(
        0.01,
        Number(
          loadAutomationsConfig(user?.id || "0").resellerCreditPriceBrl,
        ) || 8.5,
      );
      await addIptvResellerCredits(creds, {
        resellerId,
        credits: amount,
        unitPriceBrl: unit,
        saleBrl: amount * unit,
        reason: "AuxPlus manual",
      });
      const username = String(creditTarget.username || "").trim().toLowerCase();
      const folderId =
        syncResellersFolderId ||
        loadAutomationsConfig(user?.id || "0").syncResellersFolderId;
      if (username && folderId) {
        const item = data.items.find(
          (i) =>
            i.folderId === folderId &&
            i.isActive !== false &&
            i.itemId.trim().toLowerCase() === username,
        );
        if (item) {
          const updated = applyResellerRechargeToItem(item, {
            credits: amount,
            amountBrl: Math.round(unit * amount * 100) / 100,
          });
          setData((prev) => ({
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? updated : i)),
          }));
        }
      }
      toast.success(
        `${amount} crédito(s) enviados para ${creditTarget.username || creditTarget.name || "revendedor"}`,
      );
      setCreditTarget(null);
      notifyUniplayCreditsChanged({ spent: amount, source: "reseller_manual" });
      void refreshResellers(true);
      void refreshPanelCredits(true);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Falha ao adicionar créditos",
      );
    } finally {
      setAddingCredits(false);
    }
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
      void refreshPanelCredits(true);
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
      syncResellersFolderId,
      iptvAutoRefreshToken: true,
      mpAccessToken: mpAccessToken.trim(),
      mpPayerEmail: mpPayerEmail.trim(),
      resellerCreditPriceBrl,
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

  /** Ainda não venceu (hoje ou futuro) → Estender; já passou → Renovar */
  const isClientStillActive = (dueDate?: string | null) => {
    const due = String(dueDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
    const today = format(new Date(), "yyyy-MM-dd");
    return due >= today;
  };

  const openRenewDialog = (itemId: string) => {
    const preferred =
      IPTV_RENEW_OPTIONS.find((o) => o.months === renewMonths) ||
      IPTV_RENEW_OPTIONS[0];
    setRenewOption(preferred);
    setRenewTargetJobId(null);
    setRenewTargetId(itemId);
  };

  const openTestRenewDialog = (jobId: string) => {
    const preferred =
      IPTV_RENEW_OPTIONS.find((o) => o.months === renewMonths) ||
      IPTV_RENEW_OPTIONS[0];
    setRenewOption(preferred);
    setRenewTargetId(null);
    setDetailJobId(null);
    setRenewTargetJobId(jobId);
  };

  const openClientDetail = (itemId: string) => {
    const item = clients.find((c) => c.id === itemId);
    if (!item) return;
    setDetailClientId(item.id);
    setClientDetailAccess(null);
    const username = item.itemId.trim();
    if (
      !username ||
      (!bearer.trim() && !(panelUser.trim() && panelPass))
    ) {
      return;
    }
    void (async () => {
      try {
        const ensured = await ensureIptvToken(panelCreds());
        if (ensured.renewed) persistToken(ensured.token);
        const creds = { ...panelCreds(), bearerToken: ensured.token };
        const password =
          (await fetchIptvUserPassword(creds, username)) || "";
        if (!password) return;
        const links = resolveTestAccessLinks({
          username,
          password,
          m3uHost: platform.m3uHost,
          dnsFallback: platform.dnsSmarters,
        });
        setClientDetailAccess({
          password,
          m3u: links.m3u,
          dnsSmarters: links.dnsSmarters,
        });
      } catch {
        /* ignore */
      }
    })();
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

  const saveMercadoPagoConfig = async () => {
    if (!user) return;
    let token: string;
    try {
      token = assertMpAccessToken(mpAccessToken);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Access Token inválido");
      return;
    }
    if (!mpPayerEmail.trim() || !mpPayerEmail.includes("@")) {
      toast.error("Informe um e-mail válido (pagador do PIX na API)");
      return;
    }
    setSavingMp(true);
    setMpAccessToken(token);
    const next: AutomationsConfig = {
      ...config,
      mpAccessToken: token,
      mpPayerEmail: mpPayerEmail.trim(),
    };
    setConfig(next);
    const saved = await saveAutomationsConfigRemote(user.id, next);
    setSavingMp(false);
    setShowMpToken(false);
    if (saved.warning) {
      toast.message("Mercado Pago salvo neste PC", {
        description: saved.warning,
      });
    } else {
      toast.success("Mercado Pago salvo em todos os dispositivos");
    }
  };

  const testMercadoPagoConnection = async () => {
    let token: string;
    try {
      token = assertMpAccessToken(mpAccessToken);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Access Token inválido");
      return;
    }
    setTestingMp(true);
    try {
      const me = await pingMercadoPago(token);
      toast.success(
        me.nickname || me.email
          ? `Token OK · conta ${me.nickname || me.email}`
          : "Token OK no Mercado Pago",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao testar token");
    } finally {
      setTestingMp(false);
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
    const isExtend = isClientStillActive(item.dueDate);
    const verb = isExtend ? "Estendido" : "Renovado";
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
      note: `API · ${isExtend ? "estender" : "renovar"} · ${option.label}`,
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
        note: `${verb} via API · ${option.label} · vence ${formatBrDate(updated.dueDate)}`,
      });
      persistJobs(nextJobs);
      notifyUniplayCreditsChanged({
        spent: option.credits,
        source: "renew_manual",
      });
      void refreshPanelCredits(true);
      toast.success(
        `${verb}: ${item.name} · vence ${formatBrDate(updated.dueDate)}`,
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
    scope: ActivateAppScope,
    username?: string,
    opts?: { silent?: boolean },
  ) => {
    const want = (username ?? activateForms[scope].username).trim();
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
    setLookingUpPassScope(scope);
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
      patchActivateForm(scope, { password: String(remote.password) });
      if (!opts?.silent) toast.success("Senha preenchida do painel");
      return true;
    } catch (e) {
      if (!opts?.silent) {
        toast.error(e instanceof Error ? e.message : "Falha ao buscar senha");
      }
      return false;
    } finally {
      setLookingUpPassScope((cur) => (cur === scope ? null : cur));
    }
  };

  const loadRegisteredApps = async (
    scope: ActivateAppScope,
    username: string,
    opts?: { silent?: boolean },
  ) => {
    const want = username.trim();
    if (!want) {
      patchActivateForm(scope, { registered: [] });
      return;
    }
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) {
      if (!opts?.silent) toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    setLoadingAppsScope(scope);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const rows = await listSmartAppsForUsername(creds, want);
      patchActivateForm(scope, { registered: rows });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
    } catch (e) {
      patchActivateForm(scope, { registered: [] });
      if (!opts?.silent) {
        toast.error(
          e instanceof Error ? e.message : "Falha ao listar apps cadastrados",
        );
      }
    } finally {
      setLoadingAppsScope((cur) => (cur === scope ? null : cur));
    }
  };

  const runDeleteSmartApp = async (
    scope: ActivateAppScope,
    entry: SmartAppEntry,
  ) => {
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
        setActivateForms((prev) => ({
          ...prev,
          [scope]: {
            ...prev[scope],
            registered: prev[scope].registered.filter((r) => r.id !== entry.id),
          },
        }));
        toast.success("Removido da lista");
        return;
      }
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      await deleteSmartApp(creds, entry.id);
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      setActivateForms((prev) => ({
        ...prev,
        [scope]: {
          ...prev[scope],
          registered: prev[scope].registered.filter((r) => r.id !== entry.id),
        },
      }));
      toast.success("App/MAC removido do painel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setDeletingAppId(null);
    }
  };

  const clearActivateApp = (scope: ActivateAppScope) => {
    patchActivateForm(scope, emptyActivateForm());
  };

  const fillActivateFromLogin = (
    scope: ActivateAppScope,
    username: string,
    password?: string,
    opts?: { emptyMessage?: string; silentToast?: boolean },
  ) => {
    const userLogin = username.trim();
    patchActivateForm(scope, {
      username: userLogin,
      password: password?.trim() || "",
      nickname: "",
      device: "",
    });
    if (!userLogin) {
      patchActivateForm(scope, { registered: [] });
      toast.error(opts?.emptyMessage || "Sem usuário IPTV");
      return;
    }
    void loadRegisteredApps(scope, userLogin, { silent: true });
    if (!password?.trim()) {
      void lookupIptvPassword(scope, userLogin, { silent: true });
    } else if (!opts?.silentToast) {
      toast.message("Usuário carregado em Ativar app — informe o MAC e ative");
    }
  };

  const fillActivateFromClient = (itemId: string) => {
    const item = clients.find((i) => i.id === itemId);
    if (!item) return;
    fillActivateFromLogin("clientes", item.itemId || "", undefined, {
      emptyMessage: "Cliente sem usuário IPTV cadastrado",
      silentToast: true,
    });
  };

  const fillActivateFromTest = (job: IptvJob) => {
    if (job.kind !== "test") return;
    fillActivateFromLogin("testes", job.panelUsername, job.panelPassword, {
      emptyMessage: "Teste sem usuário IPTV",
    });
  };

  // Busca senha ao carregar usuário em cada formulário (clientes / testes)
  useEffect(() => {
    const want = activateForms.clientes.username.trim();
    if (want.length < 3) return;
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) return;
    if (activateForms.clientes.password.trim()) return;
    const t = window.setTimeout(() => {
      void lookupIptvPassword("clientes", want, { silent: true });
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateForms.clientes.username]);

  useEffect(() => {
    const want = activateForms.testes.username.trim();
    if (want.length < 3) return;
    if (!bearer.trim() && !(panelUser.trim() && panelPass)) return;
    if (activateForms.testes.password.trim()) return;
    const t = window.setTimeout(() => {
      void lookupIptvPassword("testes", want, { silent: true });
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateForms.testes.username]);

  const runActivateApp = async (scope: ActivateAppScope) => {
    const form = activateForms[scope];
    if (!form.username.trim() || !form.password || !form.device.trim()) {
      toast.error("Preencha usuário IPTV, senha e MAC/Device ID");
      return;
    }
    setActivatingAppScope(scope);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      await activatePartnerApp(creds, {
        app: form.appId,
        username: form.username,
        password: form.password,
        device: form.device,
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      const remembered = rememberPartnerAppActivation({
        app: form.appId,
        username: form.username,
        device: form.device,
        nickname: form.nickname,
      });
      const label =
        PARTNER_APPS.find((a) => a.id === form.appId)?.label || form.appId;
      const nick = remembered.nickname?.trim();
      toast.success(
        nick
          ? `${label} ativado · ${nick}`
          : `${label} ativado para ${form.username.trim()}`,
      );
      setActivateForms((prev) => {
        const cur = prev[scope];
        const rest = cur.registered.filter((r) => r.id !== remembered.id);
        return {
          ...prev,
          [scope]: {
            ...cur,
            nickname: "",
            registered: [remembered, ...rest],
          },
        };
      });
      void loadRegisteredApps(scope, form.username, { silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar app");
    } finally {
      setActivatingAppScope((cur) => (cur === scope ? null : cur));
    }
  };

  const saveEntryNickname = (
    scope: ActivateAppScope,
    entry: SmartAppEntry,
    nickname: string,
  ) => {
    const clean = setDeviceNickname(
      entry.username || activateForms[scope].username,
      entry.mac,
      entry.idDevice,
      nickname,
    );
    setActivateForms((prev) => ({
      ...prev,
      [scope]: {
        ...prev[scope],
        registered: prev[scope].registered.map((r) =>
          r.id === entry.id ? { ...r, nickname: clean } : r,
        ),
      },
    }));
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
      const totalTests = result.jobs.filter((j) => j.kind === "test").length;
      const parts = [
        result.created ? `${result.created} novo(s)` : "",
        result.updated ? `${result.updated} atualizado(s)` : "",
        result.removed ? `${result.removed} removido(s)` : "",
        totalTests ? `${totalTests} no total` : "",
      ].filter(Boolean);
      toast.success(
        parts.length
          ? `Testes UniPlay: ${parts.join(" · ")}`
          : "Nenhum teste encontrado na UniPlay",
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
      if (createdUser) {
        fillActivateFromLogin("testes", createdUser, password, { silentToast: true });
      }
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
      notifyUniplayCreditsChanged({ spent: 1, source: "create_test" });
      void refreshPanelCredits(true);
      toast.success(
        createdUser
          ? `Teste de ${hoursSafe}h criado: ${createdUser}. Preencha o MAC e ative o app.`
          : `Teste de ${hoursSafe}h criado. Ative o app abaixo.`,
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
      notifyUniplayCreditsChanged({
        spent: option.credits,
        source: "test_activate",
      });
      void refreshPanelCredits(true);
      toast.success(
        `Teste ativado: ${option.label} · vence ${formatBrDate(dueDate)}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar teste");
    } finally {
      setActivatingTest(false);
    }
  };

  const renderActivateAppSection = (
    scope: ActivateAppScope,
    hint?: string,
  ) => {
    const form = activateForms[scope];
    const lookingUpPass = lookingUpPassScope === scope;
    const loadingApps = loadingAppsScope === scope;
    const activatingApp = activatingAppScope === scope;
    const userPlaceholder =
      scope === "clientes"
        ? "Botão App no cliente"
        : "Botão App no teste";
    return (
            <section className="ax-surface space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold tracking-tight">
                    Ativar app
                  </h2>
                  {hint ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {hint}
                    </p>
                  ) : null}
                </div>
                {form.username.trim() ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    disabled={loadingApps || !bearer.trim()}
                    onClick={() => void loadRegisteredApps(scope, form.username)}
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
                    value={form.appId}
                    onValueChange={(v) => {
                      const next = v as PartnerAppId;
                      const meta = PARTNER_APPS.find((a) => a.id === next);
                      const device =
                        meta?.deviceField === "mac" && form.device
                          ? formatMacInput(form.device)
                          : form.device;
                      patchActivateForm(scope, { appId: next, device });
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
                  <Label className="text-xs" htmlFor={`app-nick-${scope}`}>
                    Apelido
                  </Label>
                  <Input
                    id={`app-nick-${scope}`}
                    value={form.nickname}
                    onChange={(e) =>
                      patchActivateForm(scope, {
                        nickname: e.target.value.toUpperCase().slice(0, 32),
                      })
                    }
                    placeholder="SALA, QUARTO…"
                    className="h-9"
                    autoComplete="off"
                    maxLength={32}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`app-device-${scope}`}>
                    {PARTNER_APPS.find((a) => a.id === form.appId)?.deviceField ===
                    "deviceId"
                      ? "Device ID"
                      : "MAC"}
                  </Label>
                  <Input
                    id={`app-device-${scope}`}
                    value={form.device}
                    onChange={(e) => {
                      const el = e.target;
                      const raw = el.value;
                      const isMac =
                        PARTNER_APPS.find((a) => a.id === form.appId)
                          ?.deviceField === "mac";
                      if (!isMac) {
                        patchActivateForm(scope, { device: raw });
                        return;
                      }
                      const caret = el.selectionStart ?? raw.length;
                      const hexBefore = macHexDigits(raw.slice(0, caret)).length;
                      const next = formatMacInput(raw);
                      const nextCaret = macCaretAfterHex(next, hexBefore);
                      if (next !== form.device) {
                        patchActivateForm(scope, { device: next });
                        requestAnimationFrame(() => {
                          el.setSelectionRange(nextCaret, nextCaret);
                        });
                      } else if (raw !== next) {
                        el.value = next;
                        el.setSelectionRange(nextCaret, nextCaret);
                      }
                    }}
                    placeholder={
                      PARTNER_APPS.find((a) => a.id === form.appId)
                        ?.deviceField === "mac"
                        ? "aa:bb:cc:dd:ee:ff"
                        : "Device ID"
                    }
                    className="h-9 font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={
                      PARTNER_APPS.find((a) => a.id === form.appId)
                        ?.deviceField === "mac"
                        ? 17
                        : undefined
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`app-user-${scope}`}>
                    Usuário
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      id={`app-user-${scope}`}
                      type={hideSensitive ? "password" : "text"}
                      value={form.username}
                      placeholder={userPlaceholder}
                      className="h-9 bg-muted/40"
                      autoComplete="off"
                      readOnly
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      disabled={!form.username.trim() || hideSensitive}
                      aria-label="Copiar usuário"
                      title="Copiar usuário"
                      onClick={() => void copyField("Usuário", form.username)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor={`app-pass-${scope}`}>
                    Senha
                  </Label>
                  <div className="flex gap-1.5">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        id={`app-pass-${scope}`}
                        type={
                          hideSensitive || !form.showPass ? "password" : "text"
                        }
                        value={form.password}
                        placeholder={
                          lookingUpPass
                            ? "Buscando…"
                            : "Preenche sozinha pelo App"
                        }
                        className="h-9 bg-muted/40 pr-9"
                        autoComplete="off"
                        readOnly
                      />
                      <button
                        type="button"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        onClick={() =>
                          patchActivateForm(scope, {
                            showPass: !form.showPass,
                          })
                        }
                        disabled={hideSensitive || lookingUpPass}
                        aria-label={
                          form.showPass ? "Ocultar senha" : "Mostrar senha"
                        }
                      >
                        {lookingUpPass ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : form.showPass && !hideSensitive ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      disabled={!form.password.trim() || hideSensitive}
                      aria-label="Copiar senha"
                      title="Copiar senha"
                      onClick={() => void copyField("Senha", form.password)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={activatingApp || lookingUpPass || !bearer.trim()}
                onClick={() => void runActivateApp(scope)}
              >
                {activatingApp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                Ativar
              </Button>

              {form.username.trim() ? (
                loadingApps ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando aparelhos…
                  </p>
                ) : form.registered.length > 0 ? (
                  <ul className="divide-y rounded-md border">
                    {form.registered.map((entry) => (
                      <li
                        key={String(entry.id)}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-sm"
                      >
                        <Input
                          value={entry.nickname || ""}
                          onChange={(e) =>
                            saveEntryNickname(
                              scope,
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
                          onClick={() => void runDeleteSmartApp(scope, entry)}
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
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Conecte as ferramentas que o AuxPlus usa no dia a dia."
      />

      <Tabs defaultValue="painel" className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Escolha a integração
          </p>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-background/80 p-1">
            <TabsTrigger
              value="painel"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <MonitorPlay className="h-3.5 w-3.5" />
                UniPlay
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-5 px-1.5 text-[10px]",
                    uniplayConnected &&
                      "border-success/40 bg-success/15 text-success",
                  )}
                >
                  {uniplayConnected ? "OK" : "Off"}
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                IPTV, testes e créditos
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="mercado-pago"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <QrCode className="h-3.5 w-3.5" />
                Mercado Pago
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-0.5 h-5 px-1.5 text-[10px]",
                    mpAccessToken.trim() &&
                      "border-success/40 bg-success/15 text-success",
                  )}
                >
                  {mpAccessToken.trim() ? "OK" : "Off"}
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Token para PIX
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="winbox"
              className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left data-[state=active]:shadow-sm sm:min-w-[9.5rem]"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Cable className="h-3.5 w-3.5" />
                Winbox
                <Badge
                  variant="outline"
                  className="ml-0.5 h-5 px-1.5 text-[10px]"
                >
                  Off
                </Badge>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Em breve
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="painel" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">UniPlay</p>
            <p className="text-xs text-muted-foreground">
              {uniplayConnected
                ? "Conta conectada. Use as abas abaixo para clientes, revendedores, testes e logs."
                : "Primeiro conecte sua conta UniPlay na aba Conta. Depois liberam as outras funções."}
            </p>
          </div>

          {uniplayConnected ? (
            <div className="ax-surface flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Coins className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Créditos UniPlay
                  </p>
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {loadingCredits && panelCredits == null
                      ? "…"
                      : panelCredits == null
                        ? "—"
                        : maskNum(formatIptvCredits(panelCredits))}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={loadingCredits}
                onClick={() => void refreshPanelCredits(false)}
              >
                {loadingCredits ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Atualizar
              </Button>
            </div>
          ) : null}

          <Tabs
            value={
              uniplayConnected
                ? uniplaySubTab === "renovacoes"
                  ? "logs"
                  : uniplaySubTab
                : "conexao"
            }
            onValueChange={(v) =>
              setUniplaySubTab(v === "renovacoes" ? "logs" : v)
            }
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap bg-background/80">
              {uniplayConnected ? (
                <>
                  <TabsTrigger value="ativos" className="gap-1.5">
                    Clientes
                    {activeClients.length > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-0.5 h-5 px-1.5 text-[10px]"
                      >
                        {activeClients.length}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="revendedores" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Revendedores
                    {resellers.length > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-0.5 h-5 px-1.5 text-[10px]"
                      >
                        {resellers.length}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="testes" className="gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Testes
                    {testJobsCount > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-0.5 h-5 px-1.5 text-[10px]"
                      >
                        {testJobsCount}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Logs
                  </TabsTrigger>
                  <TabsTrigger value="conexao" className="gap-1.5">
                    Conta
                    <Badge
                      variant="outline"
                      className="ml-0.5 h-5 px-1.5 text-[10px] border-success/40 bg-success/15 text-success"
                    >
                      OK
                    </Badge>
                  </TabsTrigger>
                </>
              ) : (
                <TabsTrigger value="conexao" className="gap-1.5">
                  Conta
                  <Badge
                    variant="outline"
                    className="ml-0.5 h-5 px-1.5 text-[10px]"
                  >
                    Off
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="conexao" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Login UniPlay
                </h2>
                <p className="text-xs text-muted-foreground">
                  Usuário e senha do painel para conectar o AuxPlus.
                </p>
              </div>
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

            </form>
          </section>

          {uniplayConnected ? (
            <section className="ax-surface space-y-3 p-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Pastas de sincronização
                </h2>
                <p className="text-xs text-muted-foreground">
                  Onde o AuxPlus grava clientes e revendedores vindos da UniPlay.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pasta de clientes IPTV</Label>
                <Select
                  value={syncFolderId || "__none__"}
                  onValueChange={(v) => {
                    const nextId = v === "__none__" ? "" : v;
                    setSyncFolderId(nextId);
                    if (!user) return;
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, syncFolderId: nextId };
                    saveAutomationsConfig(user.id, next);
                    setConfig(next);
                    toast.message(
                      nextId
                        ? "Botão Sincronizar UniPlay liberado nessa pasta"
                        : "Botão de sincronizar clientes removido",
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
                  Libera o botão “Sincronizar UniPlay” dentro da pasta.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pasta de revendedores</Label>
                <Select
                  value={syncResellersFolderId || "__none__"}
                  onValueChange={(v) => {
                    const nextId = v === "__none__" ? "" : v;
                    setSyncResellersFolderId(nextId);
                    if (!user) return;
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, syncResellersFolderId: nextId };
                    saveAutomationsConfig(user.id, next);
                    void saveAutomationsConfigRemote(user.id, next);
                    setConfig(next);
                    toast.message(
                      nextId
                        ? "Pasta de revendedores vinculada"
                        : "Pasta de revendedores desvinculada",
                    );
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Escolha a pasta de revendedores" />
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
                  Crie uma pasta Cliente (ex.: Revendedores) e vincule aqui.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs" htmlFor="reseller-credit-price">
                  Valor do crédito (R$)
                </Label>
                <Input
                  id="reseller-credit-price"
                  type="number"
                  min={0.01}
                  step="0.01"
                  className="h-9 max-w-[12rem]"
                  value={resellerCreditPriceBrl}
                  onChange={(e) =>
                    setResellerCreditPriceBrl(Number(e.target.value))
                  }
                  onBlur={() => {
                    if (!user) return;
                    const price = Math.max(
                      0.01,
                      Number(resellerCreditPriceBrl) || 8.5,
                    );
                    setResellerCreditPriceBrl(price);
                    const cur = loadAutomationsConfig(user.id);
                    const next = { ...cur, resellerCreditPriceBrl: price };
                    saveAutomationsConfig(user.id, next);
                    void saveAutomationsConfigRemote(user.id, next);
                    setConfig(next);
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Usado no WhatsApp para revendedores. Ex.: R${" "}
                  {Number(resellerCreditPriceBrl || 8.5).toLocaleString(
                    "pt-BR",
                    { minimumFractionDigits: 2 },
                  )}{" "}
                  × 10 créditos ={" "}
                  {(
                    Math.max(0.01, Number(resellerCreditPriceBrl) || 8.5) * 10
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  .
                </p>
              </div>
            </section>
          ) : null}
            </TabsContent>

            {uniplayConnected ? (
              <>
            <TabsContent value="ativos" className="mt-0 space-y-4">
          {renderActivateAppSection(
            "clientes",
            "Informe o MAC e ative o app.",
          )}
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  Clientes
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Longe e perto de vencer
                  {activeClients.length > 0 ? ` · ${activeClients.length}` : ""}
                  {" · vencidos ficam de fora"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setShowClientsList((v) => !v)}
              >
                {showClientsList ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showClientsList ? "Ocultar lista" : "Mostrar lista"}
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="h-11 border-primary/35 bg-primary/[0.06] pl-9 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)] placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-primary/25"
                value={q}
                onChange={(e) => {
                  const next = e.target.value;
                  setQ(next);
                  if (next.trim().length < 2) clearActivateApp("clientes");
                }}
                placeholder="Buscar por nome, usuário ou telefone…"
              />
            </div>

            {!showClientsList && q.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">
                Lista oculta. Busque (2+ caracteres) ou toque em Mostrar lista.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum cliente ativo (longe/perto) para essa busca.
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
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5"
                        onClick={() => openClientDetail(item.id)}
                      >
                        Detalhes
                      </Button>
                      {(() => {
                        const extend = isClientStillActive(item.dueDate);
                        return (
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
                            ) : extend ? (
                              <CalendarPlus className="h-3.5 w-3.5" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {extend ? "Estender" : "Renovar"}
                          </Button>
                        );
                      })()}
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
            </TabsContent>

            <TabsContent value="revendedores" className="mt-0 space-y-4">
              <section className="ax-surface space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Revendedores
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {syncResellersFolderId
                        ? `Pasta vinculada: ${
                            clientFolders.find(
                              (f) => f.id === syncResellersFolderId,
                            )?.name || syncResellersFolderId
                          }`
                        : "Vincule uma pasta em Conexão para sincronizar"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingResellers}
                      onClick={() => void refreshResellers(false)}
                    >
                      {loadingResellers ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Atualizar lista
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        syncingResellers ||
                        loadingResellers ||
                        !syncResellersFolderId
                      }
                      onClick={() => void syncResellersNow()}
                    >
                      {syncingResellers ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Users className="h-3.5 w-3.5" />
                      )}
                      Sincronizar pasta
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9"
                    value={resellersQ}
                    onChange={(e) => setResellersQ(e.target.value)}
                    placeholder="Filtrar por usuário, nome ou telefone…"
                    autoComplete="off"
                  />
                </div>

                {loadingResellers && resellers.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando revendedores…
                  </p>
                ) : resellers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum revendedor na lista. Toque em Atualizar lista.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {resellers
                      .filter((r) => {
                        const q = resellersQ.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          r.username.toLowerCase().includes(q) ||
                          (r.name || "").toLowerCase().includes(q) ||
                          (r.phone || "").toLowerCase().includes(q) ||
                          (r.email || "").toLowerCase().includes(q)
                        );
                      })
                      .map((r) => (
                        <li
                          key={`${r.id}-${r.username}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {r.name || r.username}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {maskUser(r.username)}
                              {r.phone ? ` · ${r.phone}` : ""}
                              {r.email ? ` · ${r.email}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge variant="outline" className="tabular-nums">
                              {r.credits != null
                                ? `${maskNum(formatIptvCredits(r.credits))} créd.`
                                : "—"}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              disabled={!uniplayConnected || addingCredits}
                              onClick={() => openAddCredits(r)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Créditos
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="testes" className="mt-0 space-y-4">
          {renderActivateAppSection(
            "testes",
            "Informe o MAC e ative o app.",
          )}
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">Testes</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Lista inicia oculta · toque em App para ativar o MAC
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setShowTestsList((v) => !v)}
                >
                  {showTestsList ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {showTestsList ? "Ocultar lista" : "Mostrar lista"}
                </Button>
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
                  Atualizar
                </Button>
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
            </div>
            {lastTest ? (
              <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2.5">
                <p className="text-xs font-medium text-foreground">
                  Teste gerado · {lastTest.clientName} · {lastTest.hours}h
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {maskUser(lastTest.username)}
                  {lastTest.dueDate
                    ? ` · vence ${formatBrDate(lastTest.dueDate)}`
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => {
                      const job = jobs.find((j) => j.id === lastTest.jobId);
                      if (job) openTestDetail(job);
                      else setDetailJobId(lastTest.jobId);
                    }}
                  >
                    Detalhes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      const job = jobs.find((j) => j.id === lastTest.jobId);
                      if (job) fillActivateFromTest(job);
                      else
                        fillActivateFromLogin(
                          "testes",
                          lastTest.username,
                          lastTest.password,
                        );
                    }}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    App
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="h-11 border-primary/35 bg-primary/[0.06] pl-9 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)] placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-primary/25"
                value={jobsQ}
                onChange={(e) => {
                  const next = e.target.value;
                  setJobsQ(next);
                  if (next.trim().length < 2) clearActivateApp("testes");
                }}
                placeholder="Buscar por nome ou usuário…"
              />
            </div>

            {!showTestsList && jobsQ.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">
                Lista oculta. Busque (2+ caracteres) ou toque em Mostrar lista.
              </p>
            ) : filteredTests.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum teste encontrado.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filteredTests.map((job) => {
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
                          onClick={() => openTestDetail(job)}
                        >
                          Detalhes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5"
                          onClick={() => fillActivateFromTest(job)}
                          disabled={!job.panelUsername?.trim()}
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          App
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

            <TabsContent value="logs" className="mt-0 space-y-4">
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
                </TabsList>

                <TabsContent value="renovacoes" className="mt-0 space-y-4">
                  <section className="ax-surface space-y-3 p-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold tracking-tight">
                        Renovações e extensões
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Planos renovados ou estendidos · sincroniza na conta
                        {renewLogCount > 0
                          ? ` · ${renewLogCount} registro(s)`
                          : ""}
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
                                    {maskUser(job.panelUsername)} · +
                                    {job.months}{" "}
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
                                    {job.dueDate
                                      ? formatBrDate(job.dueDate)
                                      : "—"}
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
                          Testes gerados
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Painel + WhatsApp + AuxPlus
                          {testLogCount > 0
                            ? ` · ${testLogCount} registro(s)`
                            : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        disabled={
                          (!bearer.trim() &&
                            !(panelUser.trim() && panelPass)) ||
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
                        Atualizar do painel
                      </Button>
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

                    {testLog.length > 0 ? (
                      <ul className="space-y-2">
                        {testLog.map((job) => (
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
                                  ? "Gerado"
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
                                  Duração:{" "}
                                </dt>
                                <dd className="inline text-foreground/80">
                                  {job.testHours}h
                                </dd>
                              </div>
                              <div>
                                <dt className="inline text-muted-foreground/80">
                                  Vencimento:{" "}
                                </dt>
                                <dd className="inline text-foreground/80">
                                  {job.dueDate
                                    ? formatBrDate(job.dueDate)
                                    : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline text-muted-foreground/80">
                                  Gerado em:{" "}
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
                              <p
                                className={cn(
                                  "mt-1.5 text-[11px]",
                                  job.status === "failed"
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {job.note}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                onClick={() => openTestDetail(job)}
                              >
                                Detalhes
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                disabled={!job.panelUsername?.trim()}
                                onClick={() => fillActivateFromTest(job)}
                              >
                                <Smartphone className="h-3.5 w-3.5" />
                                App
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {testLogQ.trim()
                          ? "Nenhum resultado para essa busca."
                          : "Nenhum teste ainda. Clique em Atualizar do painel."}
                      </p>
                    )}
                  </section>
                </TabsContent>
              </Tabs>
            </TabsContent>
              </>
            ) : null}
          </Tabs>
        </TabsContent>

        <TabsContent value="mercado-pago" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">Mercado Pago</p>
            <p className="text-xs text-muted-foreground">
              Configure o token aqui. O PIX sai pelo WhatsApp. Quando o cliente
              paga, o servidor libera sozinho (mesmo com o AuxPlus fechado) —
              basta cadastrar o webhook abaixo no painel do MP.
            </p>
          </div>

          <section className="ax-surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Token da API
                </h2>
                <p className="text-xs text-muted-foreground">
                  Access Token de produção (não use a Public Key).
                </p>
              </div>
              <Badge variant={mpAccessToken.trim() ? "default" : "outline"}>
                {mpAccessToken.trim() ? "Configurado" : "Pendente"}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="mp-token">
                  Access Token (não use a Public Key)
                </Label>
                <div className="relative">
                  <Input
                    id="mp-token"
                    type={showMpToken ? "text" : "password"}
                    value={mpAccessToken}
                    onChange={(e) => setMpAccessToken(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (!text) return;
                      e.preventDefault();
                      setMpAccessToken(text.trim());
                    }}
                    placeholder="APP_USR-… (token longo de Produção)"
                    className="h-9 pr-9"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setShowMpToken((v) => !v)}
                    aria-label={
                      showMpToken ? "Ocultar token" : "Mostrar token"
                    }
                  >
                    {showMpToken ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="mp-email">
                  E-mail do pagador (API)
                </Label>
                <Input
                  id="mp-email"
                  type="email"
                  value={mpPayerEmail}
                  onChange={(e) => setMpPayerEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-9"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Exigido pela API do Mercado Pago na criação do PIX (pode ser o
                  seu e-mail da conta MP).
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={savingMp}
                onClick={() => void saveMercadoPagoConfig()}
              >
                <Save className="h-3.5 w-3.5" />
                {savingMp ? "…" : "Salvar Mercado Pago"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9"
                disabled={testingMp || !mpAccessToken.trim()}
                onClick={() => void testMercadoPagoConnection()}
              >
                {testingMp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Testar token
              </Button>
            </div>
          </section>

          <section className="ax-surface space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Webhook (liberação automática)
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Com isso, o cliente paga o PIX e o sistema libera renovação /
                créditos / teste→plano + WhatsApp sem o app precisar estar aberto.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL do webhook</Label>
              <div className="flex flex-wrap gap-1.5">
                <Input
                  readOnly
                  className="h-9 font-mono text-[11px]"
                  value={`${SUPABASE_URL}/functions/v1/mp-webhook`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    void copyField(
                      "URL webhook",
                      `${SUPABASE_URL}/functions/v1/mp-webhook`,
                    );
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
              <li>
                Abra{" "}
                <a
                  className="text-primary underline underline-offset-2"
                  href="https://www.mercadopago.com.br/developers/panel/app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Mercado Pago → Suas integrações
                </a>
              </li>
              <li>Selecione o app do Access Token (Produção)</li>
              <li>Webhooks → configurar URL (cole a URL acima)</li>
              <li>
                Marque o evento <span className="font-medium">Order (Mercado Pago)</span>
              </li>
              <li>Salve. Faça um PIX de teste para validar</li>
            </ol>
          </section>
        </TabsContent>

        <TabsContent value="winbox" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-sm font-medium">Winbox</p>
            <p className="text-xs text-muted-foreground">
              Integração com MikroTik para internet (PPPoE). Ainda não está
              disponível.
            </p>
          </div>
          <section className="ax-surface space-y-3 p-5">
            <div className="flex items-start gap-2">
              <Cable className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold tracking-tight">Em breve</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Liberação automática via API do RouterOS para clientes de
                  internet. Por enquanto use só UniPlay e Mercado Pago.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!creditTarget}
        onOpenChange={(open) => {
          if (!open && !addingCredits) setCreditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar créditos</DialogTitle>
            <DialogDescription>
              Passar créditos da sua conta UniPlay para{" "}
              <span className="font-medium text-foreground">
                {creditTarget?.name || creditTarget?.username || "revendedor"}
              </span>
              . A UniPlay não aceita menos de {IPTV_RESELLER_CREDITS_MIN}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="reseller-credits-amount">Quantidade</Label>
              <Input
                id="reseller-credits-amount"
                type="number"
                min={IPTV_RESELLER_CREDITS_MIN}
                step={1}
                inputMode="numeric"
                value={creditAmount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, "");
                  setCreditAmount(raw);
                }}
                onBlur={() => {
                  const n = Math.floor(Number(creditAmount));
                  if (!Number.isFinite(n) || n < IPTV_RESELLER_CREDITS_MIN) {
                    setCreditAmount(String(IPTV_RESELLER_CREDITS_MIN));
                  } else {
                    setCreditAmount(String(n));
                  }
                }}
                autoComplete="off"
              />
              {creditAmount !== "" && !creditAmountValid ? (
                <p className="text-xs font-medium text-destructive">
                  Não pode menos de {IPTV_RESELLER_CREDITS_MIN}. Use{" "}
                  {IPTV_RESELLER_CREDITS_MIN} ou mais.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Somente {IPTV_RESELLER_CREDITS_MIN} ou mais. Seu saldo:{" "}
                  {panelCredits == null
                    ? "—"
                    : maskNum(formatIptvCredits(panelCredits))}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={addingCredits}
              onClick={() => setCreditTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={addingCredits || !creditAmountValid}
              onClick={() => void submitAddCredits()}
            >
              {addingCredits ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              {addingCredits ? "Enviando…" : "Enviar créditos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renewTargetId || !!renewTargetJobId}
        onOpenChange={(open) => {
          if (!open) {
            setRenewTargetId(null);
            setRenewTargetJobId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {(() => {
            const renewItem = renewTargetId
              ? clients.find((i) => i.id === renewTargetId)
              : undefined;
            const renewJob = renewTargetJobId
              ? jobs.find((j) => j.id === renewTargetJobId)
              : undefined;
            const due = renewItem?.dueDate ?? renewJob?.dueDate;
            const isExtend = isClientStillActive(due);
            const titleName =
              renewItem?.name || renewJob?.clientName || "Escolha o plano";
            const titleUser =
              renewItem?.itemId || renewJob?.panelUsername || "";
            const busy =
              (renewTargetId && busyId === renewTargetId) ||
              (renewTargetJobId && activatingTest);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isExtend ? "Estender UniPlay" : "Renovação UniPlay"}
                  </DialogTitle>
                  <DialogDescription>
                    {renewItem || renewJob
                      ? `${titleName} · ${
                          maskUser(titleUser) === "—"
                            ? "sem usuário"
                            : maskUser(titleUser)
                        }${due ? ` · vence ${formatBrDate(due)}` : ""}`
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
                    onClick={() => {
                      setRenewTargetId(null);
                      setRenewTargetJobId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      (!renewTargetId && !renewTargetJobId) || Boolean(busy)
                    }
                    onClick={() => {
                      if (renewTargetJobId && renewJob) {
                        void activateTestJob(renewJob, renewOption).then(() => {
                          setRenewTargetJobId(null);
                        });
                        return;
                      }
                      if (!renewTargetId) return;
                      void runApiRenew(renewTargetId, renewOption);
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isExtend ? (
                      <CalendarPlus className="h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isExtend ? "Confirmar extensão" : "Confirmar renovação"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
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
        open={!!detailClient}
        onOpenChange={(open) => {
          if (!open) {
            setDetailClientId(null);
            setClientDetailAccess(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {detailClient ? (
            <>
              <DialogHeader>
                <DialogTitle>Detalhes do cliente</DialogTitle>
                <DialogDescription>
                  {detailClient.name}
                  {detailClient.dueDate
                    ? ` · vence ${formatBrDate(detailClient.dueDate)}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9 justify-start"
                    onClick={() =>
                      void copyField("Usuário", detailClient.itemId)
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
                        clientDetailAccess?.password || "",
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
                    onClick={() =>
                      void copyField("Link M3U", clientDetailAccess?.m3u || "")
                    }
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
                      void copyField(
                        "DNS Smarters",
                        clientDetailAccess?.dnsSmarters || "",
                      )
                    }
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Copiar DNS Smarters
                  </Button>
                </div>
                <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <p>Usuário: {maskUser(detailClient.itemId)}</p>
                  <p>
                    Senha:{" "}
                    {hideSensitive
                      ? "••••••••"
                      : clientDetailAccess?.password || "—"}
                  </p>
                  <p className="break-all">
                    M3U:{" "}
                    {hideSensitive
                      ? "••••••••"
                      : clientDetailAccess?.m3u || "—"}
                  </p>
                  <p>
                    DNS:{" "}
                    {hideSensitive
                      ? "••••••••"
                      : clientDetailAccess?.dnsSmarters || "—"}
                  </p>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Ativar app (MAC)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Carrega usuário e senha do cliente em Ativar app para
                    cadastrar o aparelho.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-full sm:w-auto"
                    disabled={!detailClient.itemId?.trim()}
                    onClick={() => {
                      fillActivateFromLogin(
                        "clientes",
                        detailClient.itemId || "",
                        clientDetailAccess?.password,
                        {
                          emptyMessage: "Cliente sem usuário IPTV cadastrado",
                        },
                      );
                      setDetailClientId(null);
                      setClientDetailAccess(null);
                    }}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Ir para Ativar app
                  </Button>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDetailClientId(null);
                    setClientDetailAccess(null);
                  }}
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={!bearer.trim() || busyId === detailClient.id}
                  onClick={() => {
                    openRenewDialog(detailClient.id);
                    setDetailClientId(null);
                    setClientDetailAccess(null);
                  }}
                >
                  {isClientStillActive(detailClient.dueDate) ? (
                    <CalendarPlus className="h-4 w-4" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isClientStillActive(detailClient.dueDate)
                    ? "Estender"
                    : "Renovar"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
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
                      <p className="text-sm font-medium">Ativar app (MAC)</p>
                      <p className="text-[11px] text-muted-foreground">
                        Carrega usuário e senha do teste em Ativar app para
                        cadastrar o aparelho.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 w-full sm:w-auto"
                        disabled={!detailJob.panelUsername?.trim()}
                        onClick={() => {
                          fillActivateFromTest(detailJob);
                          setDetailJobId(null);
                        }}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Ir para Ativar app
                      </Button>
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
                  disabled={
                    activatingTest ||
                    !detailJob.panelUsername ||
                    !bearer.trim()
                  }
                  onClick={() => openTestRenewDialog(detailJob.id)}
                >
                  {isClientStillActive(detailJob.dueDate) ? (
                    <CalendarPlus className="h-4 w-4" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isClientStillActive(detailJob.dueDate)
                    ? "Estender"
                    : "Renovar"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
