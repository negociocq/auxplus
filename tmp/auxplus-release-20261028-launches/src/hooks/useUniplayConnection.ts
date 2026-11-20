import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
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
  loadIptvPlatformConfig,
  type IptvPlatformConfig,
} from "@/lib/platformApi";
import {
  ensureIptvToken,
  fetchIptvPanelCredits,
  tokenExpiresInSec,
  type IptvPanelCreds,
} from "@/lib/iptvPanelApi";
import { onUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
import { notifyUniplayConnection } from "@/lib/uniplayConnectionSync";
import {
  assertMpAccessToken,
  pingMercadoPago,
} from "@/lib/mercadoPagoApi";
import { openPanelWindow } from "@/lib/panelKeepAlive";
import type { User } from "@/types";

export type UseUniplayConnectionResult = {
  /** true quando a conta já foi carregada da nuvem + platform config. */
  ready: boolean;
  config: AutomationsConfig;
  platform: IptvPlatformConfig;
  uniplayConnected: boolean;
  bearer: string;
  panelUser: string;
  panelPass: string;
  showPass: boolean;
  saving: boolean;
  refreshingToken: boolean;
  tokenInfo: string;
  syncFolderId: string;
  syncResellersFolderId: string;
  resellerCreditPriceBrl: number;
  renewMonths: number;
  testHours: number;
  mpAccessToken: string;
  mpPayerEmail: string;
  showMpToken: boolean;
  savingMp: boolean;
  testingMp: boolean;
  panelCredits: number | null;
  loadingCredits: boolean;
  setBearer: Dispatch<SetStateAction<string>>;
  setPanelUser: Dispatch<SetStateAction<string>>;
  setPanelPass: Dispatch<SetStateAction<string>>;
  setShowPass: Dispatch<SetStateAction<boolean>>;
  setSyncFolderId: Dispatch<SetStateAction<string>>;
  setSyncResellersFolderId: Dispatch<SetStateAction<string>>;
  setResellerCreditPriceBrl: Dispatch<SetStateAction<number>>;
  setRenewMonths: Dispatch<SetStateAction<number>>;
  setTestHours: Dispatch<SetStateAction<number>>;
  setMpAccessToken: Dispatch<SetStateAction<string>>;
  setMpPayerEmail: Dispatch<SetStateAction<string>>;
  setShowMpToken: Dispatch<SetStateAction<boolean>>;
  persistConfig: (next: AutomationsConfig) => void;
  persistToken: (token: string) => void;
  panelCreds: () => IptvPanelCreds;
  refreshPanelCredits: (silent?: boolean) => Promise<void>;
  refreshTokenNow: () => Promise<void>;
  onSavePanel: (e: FormEvent) => Promise<void>;
  disconnectUniplay: () => Promise<void>;
  openPanel: () => void;
  saveMercadoPagoConfig: () => Promise<void>;
  testMercadoPagoConnection: () => Promise<void>;
};

/**
 * Camada de conexão/conta UniPlay + créditos + config derivada (sync, MP, etc).
 *
 * Compartilhada entre as páginas Conexões (Conta/Mercado Pago) e UniPlay
 * (operações que dependem do bearer/credits). Cada rota monta a própria
 * instância; nada roda em duplicidade porque as rotas são exclusivas.
 */
export function useUniplayConnection(
  user: User | null,
): UseUniplayConnectionResult {
  const [config, setConfig] = useState<AutomationsConfig>(() =>
    loadAutomationsConfig(user?.id || "0"),
  );
  const [platform, setPlatform] = useState<IptvPlatformConfig>(
    defaultIptvPlatformConfig(),
  );
  const [ready, setReady] = useState(false);
  const [bearer, setBearer] = useState(config.iptvBearerToken);
  const [panelUser, setPanelUser] = useState(config.iptvUsername);
  const [panelPass, setPanelPass] = useState(config.iptvPassword);
  const [showPass, setShowPass] = useState(false);
  const [tokenInfo, setTokenInfo] = useState("");
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renewMonths, setRenewMonths] = useState(config.renewMonths);
  const [testHours, setTestHours] = useState(config.testHours);
  const [syncFolderId, setSyncFolderId] = useState(config.syncFolderId);
  const [syncResellersFolderId, setSyncResellersFolderId] = useState(
    config.syncResellersFolderId,
  );
  const [resellerCreditPriceBrl, setResellerCreditPriceBrl] = useState(
    config.resellerCreditPriceBrl,
  );
  const [mpAccessToken, setMpAccessToken] = useState(config.mpAccessToken);
  const [mpPayerEmail, setMpPayerEmail] = useState(config.mpPayerEmail);
  const [showMpToken, setShowMpToken] = useState(false);
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [panelCredits, setPanelCredits] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Conta UniPlay vem da nuvem (todos os PCs) + cache local; platform do admin.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [autoCfg, plat] = await Promise.all([
          loadAutomationsConfigRemote(user.id),
          loadIptvPlatformConfig(),
        ]);
        if (cancelled) return;
        setConfig(autoCfg);
        setPlatform(plat);
        setBearer(autoCfg.iptvBearerToken);
        setPanelUser(autoCfg.iptvUsername);
        setPanelPass(autoCfg.iptvPassword);
        setRenewMonths(autoCfg.renewMonths);
        setTestHours(autoCfg.testHours);
        setSyncFolderId(autoCfg.syncFolderId);
        setSyncResellersFolderId(autoCfg.syncResellersFolderId);
        setMpAccessToken(autoCfg.mpAccessToken);
        setMpPayerEmail(autoCfg.mpPayerEmail);
        setResellerCreditPriceBrl(autoCfg.resellerCreditPriceBrl);
      } catch {
        /* usa o seed local se a nuvem falhar */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  // Poll de créditos (60s) + recarga quando o evento auxplus:credits dispara
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

  const persistConfig = (next: AutomationsConfig) => {
    if (!user) return;
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
      notifyUniplayConnection(true);
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
    if (!user) return;
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

  const disconnectUniplay = async () => {
    if (!user) return;
    if (
      !window.confirm(
        "Desconectar a conta UniPlay? O usuário e a senha salvos serão removidos. Você pode conectar de novo depois.",
      )
    ) {
      return;
    }
    const next: AutomationsConfig = {
      ...config,
      iptvUsername: "",
      iptvPassword: "",
      iptvBearerToken: "",
    };
    setConfig(next);
    saveAutomationsConfig(user.id, next);
    void saveAutomationsConfigRemote(user.id, next).catch(() => undefined);
    setPanelUser("");
    setPanelPass("");
    setBearer("");
    setPanelCredits(null);
    notifyUniplayConnection(false);
    toast.success("Conta UniPlay desconectada");
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

  return {
    ready,
    config,
    platform,
    uniplayConnected,
    bearer,
    panelUser,
    panelPass,
    showPass,
    saving,
    refreshingToken,
    tokenInfo,
    syncFolderId,
    syncResellersFolderId,
    resellerCreditPriceBrl,
    renewMonths,
    testHours,
    mpAccessToken,
    mpPayerEmail,
    showMpToken,
    savingMp,
    testingMp,
    panelCredits,
    loadingCredits,
    setBearer,
    setPanelUser,
    setPanelPass,
    setShowPass,
    setSyncFolderId,
    setSyncResellersFolderId,
    setResellerCreditPriceBrl,
    setRenewMonths,
    setTestHours,
    setMpAccessToken,
    setMpPayerEmail,
    setShowMpToken,
    persistConfig,
    persistToken,
    panelCreds,
    refreshPanelCredits,
    refreshTokenNow,
    onSavePanel,
    disconnectUniplay,
    openPanel,
    saveMercadoPagoConfig,
    testMercadoPagoConnection,
  };
}
