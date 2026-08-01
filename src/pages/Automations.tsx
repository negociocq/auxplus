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
  Loader2,
  MonitorPlay,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
  loadAutomationsConfig,
  saveAutomationsConfig,
  type AutomationsConfig,
} from "@/lib/automationsConfig";
import {
  defaultIptvPlatformConfig,
  loadIptvPlatformConfig,
  type IptvPlatformConfig,
} from "@/lib/platformApi";
import {
  applyPanelDueToItem,
  applyRenewalToItem,
  copyText,
  createIptvJob,
  loadIptvJobs,
  nextDueAfterRenew,
  patchIptvJob,
  saveIptvJobs,
  type IptvJob,
} from "@/lib/iptvAutomation";
import {
  activatePartnerApp,
  createIptvTest,
  deleteSmartApp,
  ensureIptvToken,
  findIptvUserByUsername,
  formatMacInput,
  getLastIssuedIptvToken,
  listSmartAppsForUsername,
  PARTNER_APPS,
  rememberPartnerAppActivation,
  removeLocalPartnerApp,
  renewIptvUser,
  setDeviceNickname,
  tokenExpiresInSec,
  type IptvPanelCreds,
  type PartnerAppId,
  type SmartAppEntry,
} from "@/lib/iptvPanelApi";
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
  const [lastCreds, setLastCreds] = useState<string | null>(null);
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
    const next = loadAutomationsConfig(user.id);
    setConfig(next);
    setBearer(next.iptvBearerToken);
    setPanelUser(next.iptvUsername);
    setPanelPass(next.iptvPassword);
    setRenewMonths(next.renewMonths);
    setTestHours(next.testHours);
    setSyncFolderId(next.syncFolderId);
    setJobs(loadIptvJobs(user.id));
    void loadIptvPlatformConfig().then(setPlatform);
  }, [user]);

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

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status === "pending" || j.status === "doing"),
    [jobs],
  );
  const doneJobs = useMemo(
    () => jobs.filter((j) => j.status === "done" || j.status === "failed").slice(0, 30),
    [jobs],
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
        },
        10 ** 9,
      );
      persistToken(token);
      toast.success(renewed ? "UniPlay conectado" : "Sessão atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setRefreshingToken(false);
    }
  };

  const onSavePanel = (e: FormEvent) => {
    e.preventDefault();
    if (!panelUser.trim() || !panelPass) {
      toast.error("Informe usuário e senha da sua conta");
      return;
    }
    setSaving(true);
    persistConfig({
      ...config,
      iptvBearerToken: bearer.trim(),
      iptvUsername: panelUser.trim(),
      iptvPassword: panelPass,
      renewMonths,
      testHours,
      syncFolderId,
      iptvAutoRefreshToken: true,
    });
    setSaving(false);
    setShowPass(false);
    toast.success("Conta UniPlay salva");
    void refreshTokenNow();
  };

  const openPanel = () => {
    const url = platform.panelUrl.trim();
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

  const runApiRenew = async (itemId: string) => {
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
    const months = renewMonths;
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
      note: `API · +${months} mês(es)`,
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
      await renewIptvUser(creds, remote.id, months);
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
        note: `Renovado via API · vence ${updated.dueDate?.split("-").reverse().join("/") || "—"}`,
      });
      persistJobs(nextJobs);
      toast.success(
        `Renovado: ${item.name} · vence ${updated.dueDate?.split("-").reverse().join("/") || "—"}`,
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

  const runApiTest = async (itemId?: string) => {
    const item = itemId ? clients.find((i) => i.id === itemId) : undefined;
    if (!bearer.trim()) {
      toast.error("Conecte sua conta UniPlay antes");
      return;
    }
    const job = createIptvJob({
      kind: "test",
      status: "doing",
      itemRefId: item?.id || "",
      clientName: item?.name || "Teste avulso",
      panelUsername: item?.itemId?.trim() || "",
      phone: item?.phone || "",
      dueDate: item?.dueDate || null,
      months: renewMonths,
      testHours,
      note: `API · teste ${testHours}h`,
    });
    let nextJobs = [job, ...jobs];
    persistJobs(nextJobs);
    setBusyId(item?.id || job.id);
    try {
      const ensured = await ensureIptvToken(panelCreds());
      if (ensured.renewed) persistToken(ensured.token);
      const creds = { ...panelCreds(), bearerToken: ensured.token };
      const panelUser = item?.itemId?.trim() || "";
      const iptvLogin = item?.itemId?.trim() || "";
      const result = await createIptvTest(creds, {
        testHours,
        packageId: platform.packageId,
        username: iptvLogin || undefined,
        whatsapp: item?.phone?.trim() || undefined,
        nota: item
          ? `${item.name}${iptvLogin ? ` · ${iptvLogin}` : ""}`
          : "teste uniplay",
      });
      const issued = getLastIssuedIptvToken();
      if (issued) persistToken(issued);
      const createdUser = result.username || iptvLogin;
      const userPass = [createdUser, result.password].filter(Boolean).join(" / ");
      if (userPass) {
        setLastCreds(userPass);
        await copyText(userPass);
      }
      nextJobs = patchIptvJob(nextJobs, job.id, {
        status: "done",
        panelUsername: createdUser || job.panelUsername,
        note: userPass
          ? `Teste OK · ${userPass}`
          : result.message || "Teste criado via API",
      });
      persistJobs(nextJobs);
      toast.success(
        userPass
          ? `Teste criado: ${userPass} (copiado)`
          : iptvLogin
            ? `Teste criado para ${iptvLogin}`
            : "Teste criado no painel",
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
            `Renovado no AuxPlus até ${updated.dueDate?.split("-").reverse().join("/")}`,
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

  const removeJob = (job: IptvJob) => {
    persistJobs(jobs.filter((j) => j.id !== job.id));
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
                    value={panelUser}
                    onChange={(e) => setPanelUser(e.target.value)}
                    placeholder="Login do painel"
                    className="h-9"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="iptv-pass">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="iptv-pass"
                      type={showPass ? "text" : "password"}
                      value={panelPass}
                      onChange={(e) => setPanelPass(e.target.value)}
                      placeholder="Senha"
                      autoComplete="current-password"
                      className="h-9 pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="renew-m">
                    Meses
                  </Label>
                  <Input
                    id="renew-m"
                    type="number"
                    min={1}
                    max={24}
                    value={renewMonths}
                    onChange={(e) =>
                      setRenewMonths(
                        Math.max(1, Math.min(24, Number(e.target.value) || 1)),
                      )
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="test-h">
                    Teste (h)
                  </Label>
                  <Input
                    id="test-h"
                    type="number"
                    min={1}
                    max={6}
                    value={testHours}
                    onChange={(e) =>
                      setTestHours(
                        Math.max(1, Math.min(6, Number(e.target.value) || 6)),
                      )
                    }
                    className="h-9"
                  />
                </div>
                <div className="col-span-2 flex flex-wrap items-end gap-1.5">
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
                    disabled={!platform.panelUrl.trim()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Painel
                  </Button>
                </div>
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

              {lastCreds ? (
                <p className="rounded-md border border-success/30 bg-success/5 px-2.5 py-1.5 text-xs">
                  Último teste:{" "}
                  <code className="font-mono text-foreground">{lastCreds}</code>
                </p>
              ) : null}
            </form>
          </section>

          <section className="ax-surface space-y-3 p-4">
            <h2 className="text-sm font-semibold tracking-tight">Clientes</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="h-11 border-primary/35 bg-primary/[0.06] pl-9 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)] placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-primary/25"
                value={q}
                onChange={(e) => setQ(e.target.value)}
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
                        {item.itemId || "—"}
                        {item.dueDate
                          ? ` · ${item.dueDate.split("-").reverse().join("/")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5"
                        disabled={!bearer.trim() || busyId === item.id}
                        onClick={() => void runApiRenew(item.id)}
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
                        onClick={() => void runApiTest(item.id)}
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
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs" htmlFor="app-pass">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="app-pass"
                    type={showAppPass ? "text" : "password"}
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder={
                      lookingUpPass ? "Buscando…" : "Preenche sozinha"
                    }
                    className="h-9 pr-9"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setShowAppPass((v) => !v)}
                    aria-label={showAppPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {lookingUpPass ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : showAppPass ? (
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

          {openJobs.length > 0 || doneJobs.length > 0 ? (
            <section className="ax-surface space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight">Fila</h2>
                <p className="text-xs text-muted-foreground">
                  {openJobs.length} em aberto
                </p>
              </div>

              {openJobs.length > 0 ? (
                <ul className="space-y-1.5">
                  {openJobs.map((job) => (
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
                            {job.panelUsername}
                            {job.kind === "renew"
                              ? ` · +${job.months}m`
                              : ` · ${job.testHours}h`}
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
                          {job.kind === "renew" ? "Renovação" : "Teste"} ·{" "}
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
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeJob(job)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {doneJobs.length > 0 ? (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Recentes
                  </p>
                  <ul className="space-y-1">
                    {doneJobs.map((job) => (
                      <li
                        key={job.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                      >
                        <span className="truncate">
                          {job.clientName} ·{" "}
                          {job.kind === "renew" ? "renovação" : "teste"} ·{" "}
                          {format(new Date(job.updatedAt), "dd/MM HH:mm")}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => removeJob(job)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
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
    </div>
  );
}
