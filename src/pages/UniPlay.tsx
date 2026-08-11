import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarPlus,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Coins,
  Eye,
  EyeOff,
  FlaskConical,
  Headset,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  UserCircle,
  Users,
  Wallet,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatBrDate } from "@/lib/format";
import { normSearch } from "@/lib/utils";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useApp } from "@/context/AppContext";
import { useUniplayConnection } from "@/hooks/useUniplayConnection";
import { useDialogHistoryBack } from "@/hooks/useDialogHistoryBack";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { hasUsedProrrogaInCurrentCycle, extractProrrogaUsage } from "@/lib/itemExtensions";
import { prorrogaIptvUser, fetchIptvExpDate, buildProrrogaMessage, ensureIptvToken } from "@/lib/iptvPanelApi";
import { applyProrrogaToItem } from "@/lib/iptvAutomation";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { PixRenewPanel } from "@/components/whatsapp/PixRenewPanel";
import { WhatsappBotPanel } from "@/components/whatsapp/WhatsappBotPanel";
import {
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import {
  applyPanelDueToItem,
  applyRenewalToItem,
  applyResellerRechargeToItem,
  copyText,
  createIptvJob,
  loadIptvJobs,
  loadIptvJobsRemote,
  mergePanelTestsIntoJobs,
  mergeWhatsAppLogSources,
  patchIptvJob,
  saveIptvJobs,
  syncIptvResellersToFolder,
  type IptvJob,
} from "@/lib/iptvAutomation";
import { loadMpOrdersRemote } from "@/lib/mercadoPagoOrders";
import { loadWaBotStateRemote } from "@/lib/whatsappBotConfig";
import { notifyUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
import {
  activatePartnerApp,
  addIptvResellerCredits,
  resolveIptvResellerPanelId,
  buildRenewalReceiptMessage,
  createIptvTest,
  deleteSmartApp,
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
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
} from "@/lib/platformApi";
import { isRevenueFolderType } from "@/types";
import { cn } from "@/lib/utils";

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

export default function UniPlay() {
  const { user, data, setData } = useApp();
  const {
    hidden: hideSensitive,
    user: maskUser,
    num: maskNum,
    phone: maskPhone,
  } = useHideBalance();
  const uni = useUniplayConnection(user);
  const {
    ready,
    uniplayConnected,
    bearer,
    panelUser,
    panelPass,
    platform,
    config,
    renewMonths,
    testHours,
    syncResellersFolderId,
    panelCredits,
    setRenewMonths,
    setTestHours,
    panelCreds,
    persistToken,
    refreshPanelCredits,
  } = uni;

  const [tab, setTab] = useState("clientes");
  const [jobs, setJobs] = useState<IptvJob[]>([]);
  const [q, setQ] = useState("");
  const [resellers, setResellers] = useState<IptvReseller[]>([]);
  const [loadingResellers, setLoadingResellers] = useState(false);
  const [syncingResellers, setSyncingResellers] = useState(false);
  const [resellersQ, setResellersQ] = useState("");
  const [creditTarget, setCreditTarget] = useState<IptvReseller | null>(null);
  const [creditAmount, setCreditAmount] = useState(
    String(IPTV_RESELLER_CREDITS_MIN),
  );
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

  // Carrega jobs (cache local) + mescla com a nuvem (regras/log em qualquer PC)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

        const clientUsernames = data.items
          .filter((i) => i.isActive !== false)
          .map((i) => i.itemId);
        const result = mergePanelTestsIntoJobs(loadIptvJobs(user.id), users, {
          m3uHost: platform.m3uHost,
          dnsFallback: platform.dnsSmarters,
          excludeUsernames: clientUsernames,
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
    data.items,
  ]);

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

  /** Ativos: Longe / Perto de vencer (contagem sem vencidos) */
  const activeClients = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.status === "Longe de Vencer" || c.status === "Perto de Vencer",
      ),
    [clients],
  );
  /** Vencidos também aparecem na lista — para renovação manual */
  const overdueClients = useMemo(
    () => clients.filter((c) => c.status === "Já Vencido"),
    [clients],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const nq = normSearch(q);
    // Oculto por padrão; busca (≥2) ou "Mostrar lista" revela
    if (!showClientsList && term.length < 2) return [];
    const rank = (status?: string | null) => {
      if (status === "Perto de Vencer") return 0;
      if (status === "Longe de Vencer") return 1;
      return 2;
    };
    return [...activeClients, ...overdueClients]
      .filter((i) => {
        if (term.length < 2) return true;
        return (
          normSearch(i.name).includes(nq) ||
          normSearch(i.itemId).includes(nq) ||
          normSearch(i.phone || "").includes(nq)
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
  }, [activeClients, overdueClients, q, showClientsList]);

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

  /** Usernames já cadastrados como cliente — não listar em Testes */
  const clientUsernameSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      const u = c.itemId.trim().toLowerCase();
      if (u) set.add(u);
    }
    return set;
  }, [clients]);

  /** Oculto por padrão; busca (≥2) ou "Mostrar lista" revela */
  const filteredTests = useMemo(() => {
    const term = jobsQ.trim().toLowerCase();
    if (!showTestsList && term.length < 2) return [];
    const now = Date.now();
    return jobs
      .filter((j) => {
        if (j.kind !== "test") return false;
        const u = j.panelUsername.trim().toLowerCase();
        // Cliente ativo no AuxPlus não aparece em Testes
        if (u && clientUsernameSet.has(u)) return false;
        // Plano longo (vence daqui a >2 dias) não é teste ativo
        if (j.status !== "pending" && j.status !== "doing") {
          const dueRaw = String(j.dueDate || "").trim();
          if (dueRaw) {
            const due = Date.parse(dueRaw.replace(" ", "T"));
            if (Number.isFinite(due) && due - now > 2 * 86_400_000) {
              return false;
            }
          }
        }
        return term.length < 2 || jobMatchesQuery(j, jobsQ);
      })
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, showTestsList && term.length < 2 ? 100 : 50);
  }, [jobs, jobsQ, showTestsList, clientUsernameSet]);
  const isRealTestJob = (j: (typeof jobs)[number]) => {
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
  const testJobsCount = useMemo(
    () => jobs.filter(isRealTestJob).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, clientUsernameSet],
  );

  // Limpa fantasmas da aba Testes (cliente AuxPlus ou “teste” que já virou plano longo)
  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    const next = jobs.filter((j) => {
      if (j.kind !== "test") return true;
      const u = j.panelUsername.trim().toLowerCase();
      if (u && clientUsernameSet.has(u)) return false;
      // Plano longo gravado como teste (vence daqui a >2 dias) → some da lista
      if (j.status === "pending" || j.status === "doing") return true;
      const dueRaw = String(j.dueDate || "").trim();
      if (dueRaw) {
        const due = Date.parse(dueRaw.replace(" ", "T"));
        if (Number.isFinite(due) && due - now > 2 * 86_400_000) return false;
      }
      return true;
    });
    if (next.length === jobs.length) return;
    persistJobs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, clientUsernameSet, jobs.length]);

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

  // Busca senha ao carregar usuário em cada formulário (clientes / testes).
  // Antes dos guards: hook sempre roda, em toda renderização.
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

  if (!user) return null;
  if (!ready) return <LoadingScreen />;
  if (!uniplayConnected) return <Navigate to="/conexoes" replace />;

  const persistJobs = (next: IptvJob[]) => {
    setJobs(next);
    saveIptvJobs(user.id, next);
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
      toast.error("Escolha a pasta de revendedores em Conexões");
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

  const sendProrrogaMessage = async (item: Item, kind: "48h" | "23:59") => {
    if (!user) return;
    const phone = item.phone?.trim();
    if (!phone) {
      toast.message("Prorrogação aplicada, mas cliente sem telefone para enviar mensagem");
      return;
    }
    try {
      const evo = await loadEvolutionPlatformConfig();
      if (!isEvolutionConfigured(evo)) {
        toast.message("Prorrogação aplicada. Configure o WhatsApp (Evolution) para enviar mensagem");
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
        toast.message("Prorrogação aplicada. WhatsApp desconectado — mensagem não enviada");
        return;
      }

      // Carrega configurações do WhatsApp para pegar o template
      const waSettings = loadWhatsappSettings(user.id);
      // Extrai a data antiga do marcador de prorrogação (se existir)
      // ou usa a data atual como fallback
      const prorrogaUsage = extractProrrogaUsage(item);
      const oldDue = prorrogaUsage?.oldDue || item.dueDate;
      const newDue = item.dueDate; // Data já atualizada pela applyProrrogaToItem

      const text = buildProrrogaMessage(
        item.name,
        item.itemId,
        oldDue,
        newDue,
        kind,
        waSettings.prorrogaMessage
      );
      await sendEvolutionText(runtime, phone, text);
      toast.success("Mensagem de prorrogação enviada no WhatsApp");
    } catch (e) {
      toast.message(
        e instanceof Error
          ? `Prorrogação aplicada, mas falhou o WhatsApp: ${e.message}`
          : "Prorrogação aplicada, mas falhou o envio da mensagem",
      );
    }
  };

  const runProrroga = async (itemId: string, kind: "48h" | "23:59") => {
    setBusyId(itemId);
    try {
      const item = data.items.find((i) => i.id === itemId);
      if (!item) throw new Error("Item não encontrado");

      // Verifica se já usou prorrogação no ciclo atual
      if (hasUsedProrrogaInCurrentCycle(item)) {
        toast.error("Este cliente já usou prorrogação neste ciclo de pagamento");
        return;
      }

      if (!bearer.trim()) {
        toast.error("Conecte sua conta UniPlay antes");
        return;
      }

      // Carrega configurações da plataforma para pegar regPassword
      const platformConfig = await loadAutomationsConfig();
      const regPassword = platformConfig?.platform?.regPassword?.trim();

      // Obtém credenciais atualizadas (seguindo o padrão de runApiRenew)
      const ensured = await ensureIptvToken({
        apiBaseUrl: config.iptvApiBaseUrl,
        bearerToken: bearer.trim(),
        defaultPackage: "1",
        regPassword: regPassword || undefined,
      });

      // Cria objeto creds com token atualizado
      const creds = {
        apiBaseUrl: config.iptvApiBaseUrl,
        bearerToken: ensured.token,
        defaultPackage: "1",
        regPassword: regPassword || undefined,
      };

      // Chama API do painel
      toast.info(`Aplicando prorrogação (${kind}) no painel...`);
      await prorrogaIptvUser(creds, item.itemId, kind);

      // Pega a data real do painel
      toast.info("Confirmando nova data de vencimento...");
      const panelExp = await fetchIptvExpDate(creds, item.itemId);

      // Atualiza item localmente
      const updated = applyProrrogaToItem(item, kind, panelExp);
      const newData = updateItem(data, updated.id, updated);
      setData(newData);

      // Envia mensagem WhatsApp
      toast.info("Enviando mensagem de prorrogação...");
      await sendProrrogaMessage(updated, kind);

      toast.success(
        `Prorrogação (${kind}) aplicada! Mensagem enviada ao WhatsApp`
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Falha ao prorrogar (${kind})`
      );
    } finally {
      setBusyId(null);
    }
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

  const focusActivateApp = (scope: ActivateAppScope) => {
    // Não zera a busca: o que o usuário digitou permanece até ele apagar
    // manualmente. Só esconde a lista para focar no Ativar app.
    if (scope === "clientes") {
      setShowClientsList(false);
    } else {
      setShowTestsList(false);
    }
    // Espera o bloco Ativar app montar (só aparece com username)
    window.setTimeout(() => {
      document.getElementById(`ativar-app-${scope}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      const mac = document.getElementById(
        `app-device-${scope}`,
      ) as HTMLInputElement | null;
      mac?.focus({ preventScroll: true });
    }, 100);
  };

  const fillActivateFromClient = (itemId: string) => {
    const item = clients.find((i) => i.id === itemId);
    if (!item) return;
    fillActivateFromLogin("clientes", item.itemId || "", undefined, {
      emptyMessage: "Cliente sem usuário IPTV cadastrado",
      silentToast: true,
    });
    if (item.itemId?.trim()) focusActivateApp("clientes");
  };

  const fillActivateFromTest = (job: IptvJob) => {
    if (job.kind === "test") {
      fillActivateFromLogin("testes", job.panelUsername, job.panelPassword, {
        emptyMessage: "Teste sem usuário IPTV",
        silentToast: true,
      });
      if (job.panelUsername?.trim()) focusActivateApp("testes");
      return;
    }
    // Renovação (logs): abre Ativar app na aba Clientes
    fillActivateFromLogin("clientes", job.panelUsername, job.panelPassword, {
      emptyMessage: "Renovação sem usuário IPTV",
      silentToast: true,
    });
    if (job.panelUsername?.trim()) {
      setTab("clientes");
      focusActivateApp("clientes");
    }
  };

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
      const clientUsernames = data.items
        .filter((i) => i.isActive !== false)
        .map((i) => i.itemId);
      const result = mergePanelTestsIntoJobs(loadIptvJobs(user.id), users, {
        m3uHost: platform.m3uHost,
        dnsFallback: platform.dnsSmarters,
        excludeUsernames: clientUsernames,
      });
      persistJobs(result.jobs);
      const exclude = new Set(
        clientUsernames.map((u) => u.trim().toLowerCase()).filter(Boolean),
      );
      const totalTests = result.jobs.filter((j) => {
        if (j.kind !== "test") return false;
        const u = j.panelUsername.trim().toLowerCase();
        return !(u && exclude.has(u));
      }).length;
      const parts = [
        result.created ? `${result.created} novo(s)` : "",
        result.updated ? `${result.updated} atualizado(s)` : "",
        result.removed ? `${result.removed} removido(s)` : "",
        totalTests ? `${totalTests} no total` : "",
      ].filter(Boolean);
      toast.success(
        totalTests === 0
          ? "Nenhum teste no painel UniPlay — lista limpa"
          : parts.length
            ? `Testes UniPlay: ${parts.join(" · ")}`
            : "Testes atualizados",
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

  const openJobDetail = (job: IptvJob) => {
    setDetailJobId(job.id);
    // Completa senha/M3U ao abrir (teste ou renovação)
    if (
      !job.panelUsername.trim() ||
      (job.panelPassword?.trim() && job.m3u?.trim()) ||
      (!bearer.trim() && !(panelUser.trim() && panelPass))
    ) {
      return;
    }
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

  const completeJob = (job: IptvJob) => {
    setBusyId(job.id);
    try {
      if (job.kind === "renew" && job.itemRefId) {
        const item = data.items.find((i) => i.id === job.itemRefId);
        if (item) {
          const updated = applyRenewalToItem(item, job.months);
          setData({
            ...data,
            items: data.items.map((i) => (i.id === item.id ? updated : i)),
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
    // Indica qual cliente (da lista) é dono do usuário preenchido no formulário
    const matchClient =
      scope === "clientes" && form.username.trim()
        ? clients.find(
            (c) =>
              c.itemId.trim().toLowerCase() ===
              form.username.trim().toLowerCase(),
          )
        : null;
    // Idem para a aba Testes: mostra o teste/contato correspondente
    const matchTest =
      scope === "testes" && form.username.trim()
        ? jobs.find(
            (j) =>
              j.kind === "test" &&
              j.panelUsername.trim().toLowerCase() ===
                form.username.trim().toLowerCase(),
          )
        : null;
    return (
      <section
        id={`ativar-app-${scope}`}
        className="ax-surface scroll-mt-20 space-y-3 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Ativar app</h2>
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

        {matchClient || matchTest ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-primary/20 bg-primary/[0.07] px-2.5 py-1.5 text-xs text-muted-foreground">
            <UserCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
            {matchClient ? (
              <>
                <span className="font-semibold text-foreground">
                  {matchClient.name}
                </span>
                <span className="truncate">{matchClient.itemId}</span>
                {matchClient.dueDate ? (
                  <span>· vence {formatBrDate(matchClient.dueDate)}</span>
                ) : null}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {matchTest?.clientName || matchTest?.panelUsername}
                </span>
                <span className="truncate">{matchTest?.panelUsername}</span>
                {matchTest?.dueDate ? (
                  <span>· vence {formatBrDate(matchTest.dueDate)}</span>
                ) : null}
                {matchTest?.phone ? (
                  <a
                    href={`tel:+${matchTest.phone.replace(/\D/g, "")}`}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    title="Ligar para quem pediu o teste"
                  >
                    <Phone className="h-3 w-3" />
                    {maskPhone(matchTest.phone)}
                  </a>
                ) : null}
              </>
            )}
          </p>
        ) : null}

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
                PARTNER_APPS.find((a) => a.id === form.appId)?.deviceField ===
                "mac"
                  ? "aa:bb:cc:dd:ee:ff"
                  : "Device ID"
              }
              className="h-9 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              maxLength={
                PARTNER_APPS.find((a) => a.id === form.appId)?.deviceField ===
                "mac"
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
        title="UniPlay"
        description="Clientes, revendedores, testes, renovações e atendimento do seu painel IPTV."
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap bg-background/80">
          <TabsTrigger value="clientes" className="gap-1.5">
            Clientes
            {activeClients.length > 0 || overdueClients.length > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 px-1.5 text-[10px]"
              >
                {activeClients.length + overdueClients.length}
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
          <TabsTrigger value="renovacoes" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            Renovações
          </TabsTrigger>
          <TabsTrigger value="atendimento" className="gap-1.5">
            <Headset className="h-3.5 w-3.5" />
            Atendimento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-0 space-y-4">
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">
                  Clientes
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Longe e perto de vencer
                  {activeClients.length > 0 ? ` · ${activeClients.length}` : ""}
                  {overdueClients.length
                    ? ` · ${overdueClients.length} vencido${
                        overdueClients.length === 1 ? "" : "s"
                      }`
                    : ""}
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
                      {isClientStillActive(item.dueDate) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 px-2.5"
                              disabled={!bearer.trim() || busyId === item.id || hasUsedProrrogaInCurrentCycle(item)}
                            >
                              {busyId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <CalendarClock className="h-3.5 w-3.5 mr-1" />
                              )}
                              Prorrogar
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => runProrroga(item.id, "48h")}
                              disabled={busyId === item.id}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">+48 horas</span>
                                <span className="text-xs text-muted-foreground">
                                  Confiança ao cliente
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => runProrroga(item.id, "23:59")}
                              disabled={busyId === item.id}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">Até 23:59</span>
                                <span className="text-xs text-muted-foreground">
                                  Mesmo dia do vencimento
                                </span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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

          {/* Sempre visível: limpar a busca só limpa os dados do formulário */}
          {renderActivateAppSection("clientes")}
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
                    : "Vincule uma pasta em Conexões para sincronizar"}
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
                    const q = normSearch(resellersQ);
                    if (!q) return true;
                    return (
                      normSearch(r.username).includes(q) ||
                      normSearch(r.name || "").includes(q) ||
                      normSearch(r.phone || "").includes(q) ||
                      normSearch(r.email || "").includes(q)
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
          <section className="ax-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-tight">Testes</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Espelha o painel UniPlay · Atualizar limpa o que foi apagado lá
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
                      if (job) openJobDetail(job);
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
                        {job.phone ? (
                          <a
                            href={`tel:+${job.phone.replace(/\D/g, "")}`}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                            title="Ligar para quem pediu o teste"
                          >
                            <Phone className="h-3 w-3" />
                            {maskPhone(job.phone)}
                          </a>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 px-2.5"
                          onClick={() => openJobDetail(job)}
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

          {/* Sempre visível: limpar a busca só limpa os dados do formulário */}
          {renderActivateAppSection(
            "testes",
            "Informe o MAC e ative o app.",
          )}
        </TabsContent>

        <TabsContent value="renovacoes" className="mt-0 space-y-4">
          <PixRenewPanel />
        </TabsContent>

        <TabsContent value="atendimento" className="mt-0 space-y-4">
          <WhatsappBotPanel />
        </TabsContent>
      </Tabs>

      {/* Adicionar créditos */}
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

      {/* Renovar / estender */}
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

      {/* Gerar teste */}
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

      {/* Detalhes do cliente */}
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
                      const username = detailClient.itemId || "";
                      const password = clientDetailAccess?.password;
                      setDetailClientId(null);
                      setClientDetailAccess(null);
                      fillActivateFromLogin("clientes", username, password, {
                        emptyMessage: "Cliente sem usuário IPTV cadastrado",
                        silentToast: true,
                      });
                      if (username.trim()) focusActivateApp("clientes");
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

      {/* Detalhes do teste / renovação */}
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
                <DialogTitle>
                  {detailJob.kind === "renew"
                    ? "Detalhes da renovação"
                    : "Detalhes do teste"}
                </DialogTitle>
                <DialogDescription>
                  {detailJob.clientName}
                  {detailJob.dueDate
                    ? ` · vence ${formatBrDate(detailJob.dueDate)}`
                    : ""}
                  {detailJob.kind === "renew" && detailJob.months
                    ? ` · +${detailJob.months} ${
                        detailJob.months === 1 ? "mês" : "meses"
                      }`
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
                      {detailJob.phone ? (
                        <p>
                          Telefone:{" "}
                          <a
                            href={`tel:+${detailJob.phone.replace(/\D/g, "")}`}
                            className="font-medium text-primary hover:underline"
                            title="Ligar para quem pediu o teste"
                          >
                            {maskPhone(detailJob.phone)}
                          </a>
                        </p>
                      ) : null}
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
                      {detailJob.kind === "renew" ? (
                        <p>
                          Plano: +{detailJob.months}{" "}
                          {detailJob.months === 1 ? "mês" : "meses"}
                        </p>
                      ) : detailJob.testHours ? (
                        <p>Duração: {detailJob.testHours}h</p>
                      ) : null}
                      {detailJob.note ? (
                        <p className="whitespace-pre-wrap break-all">
                          Nota: {detailJob.note}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">Ativar app (MAC)</p>
                      <p className="text-[11px] text-muted-foreground">
                        Carrega usuário e senha em Ativar app para cadastrar o
                        aparelho.
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
                    !detailJob.panelUsername ||
                    !bearer.trim() ||
                    (detailJob.kind === "test"
                      ? activatingTest
                      : busyId === detailJob.itemRefId)
                  }
                  onClick={() => {
                    if (
                      detailJob.kind === "renew" &&
                      detailJob.itemRefId
                    ) {
                      openRenewDialog(detailJob.itemRefId);
                      setDetailJobId(null);
                      return;
                    }
                    openTestRenewDialog(detailJob.id);
                  }}
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
