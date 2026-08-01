import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { mergeLocalAvatars } from "@/lib/avatar";

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

  /** Evita persist antigo sobrescrever exclusão recente */
  const pendingPersist = useRef<AppData | null>(null);
  const persisting = useRef(false);
  const dirty = useRef(false);

  const flushPersist = useCallback(async () => {
    if (persisting.current) return;
    persisting.current = true;
    try {
      while (pendingPersist.current) {
        const snapshot = pendingPersist.current;
        pendingPersist.current = null;
        try {
          await persistAppDataToSupabase(snapshot);
        } catch (err) {
          console.error("[AuxPlus] Falha ao salvar no Supabase", err);
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao salvar no Supabase",
          );
        }
      }
    } finally {
      persisting.current = false;
      if (!pendingPersist.current) dirty.current = false;
      else void flushPersist();
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const remote = await fetchAppDataFromSupabase();
      if (dirty.current) return;
      setDataState(mergeLocalAvatars(remote));
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

  // Evita tela com dados antigos — mas não sobrescreve enquanto há save pendente
  useEffect(() => {
    const pull = () => {
      if (dirty.current || persisting.current) return;
      void fetchAppDataFromSupabase()
        .then((remote) => {
          if (dirty.current || persisting.current) return;
          setDataState(mergeLocalAvatars(remote));
        })
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") pull();
    };
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", pull);
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
        dirty.current = true;
        pendingPersist.current = refreshed;
        void flushPersist();
        return refreshed;
      });
    },
    [flushPersist],
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
