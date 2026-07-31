import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppData, User } from "@/types";
import {
  getSessionUserId,
  refreshItemStatuses,
  setSessionUserId,
} from "@/lib/storage";
import {
  fetchAppDataFromSupabase,
  loginWithSupabase,
  persistAppDataToSupabase,
} from "@/lib/supabaseApi";

interface AppContextValue {
  data: AppData;
  user: User | null;
  loading: boolean;
  backend: "supabase";
  error: string | null;
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const emptyData: AppData = {
  users: [],
  folders: [],
  folderSettings: [],
  folderMessages: [],
  whatsappMessages: [],
  items: [],
  tickets: [],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(emptyData);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    getSessionUserId(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backend = "supabase" as const;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const remote = await fetchAppDataFromSupabase();
      setDataState(remote);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar dados";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Evita tela com dados antigos em memória (ex.: datas/órfãos já corrigidos no banco)
  useEffect(() => {
    const onFocus = () => {
      void fetchAppDataFromSupabase()
        .then((remote) => setDataState(remote))
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const setData = useCallback(
    (updater: AppData | ((prev: AppData) => AppData)) => {
      setDataState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: AppData) => AppData)(prev)
            : updater;
        const refreshed = refreshItemStatuses(next);

        void persistAppDataToSupabase(refreshed).catch((err) => {
          console.error("[AuxPlus] Falha ao salvar no Supabase", err);
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao salvar no Supabase",
          );
        });

        return refreshed;
      });
    },
    [],
  );

  const user = useMemo(
    () => data.users.find((u) => u.id === sessionId) ?? null,
    [data.users, sessionId],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await loginWithSupabase(username, password);
      if (result.error || !result.user) return result.error || "Erro no login";
      setSessionUserId(result.user.id);
      setSessionId(result.user.id);
      // garante dados atualizados após login
      try {
        const remote = await fetchAppDataFromSupabase();
        setDataState(remote);
      } catch {
        /* keep current */
      }
      return null;
    },
    [],
  );

  const logout = useCallback(() => {
    setSessionUserId(null);
    setSessionId(null);
  }, []);

  const value = useMemo(
    () => ({
      data,
      user,
      loading,
      backend,
      error,
      setData,
      login,
      logout,
      refresh,
    }),
    [data, user, loading, backend, error, setData, login, logout, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
