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
  loadData,
  refreshItemStatuses,
  saveData,
  setSessionUserId,
} from "@/lib/storage";
import {
  fetchAppDataFromSupabase,
  isSupabaseConfigured,
  loginWithSupabase,
  persistAppDataToSupabase,
} from "@/lib/supabaseApi";

interface AppContextValue {
  data: AppData;
  user: User | null;
  loading: boolean;
  backend: "supabase" | "local";
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
  const [backend] = useState<"supabase" | "local">(() =>
    isSupabaseConfigured ? "supabase" : "local",
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSupabaseConfigured) {
        const remote = await fetchAppDataFromSupabase();
        setDataState(remote);
      } else {
        setDataState(refreshItemStatuses(loadData()));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar dados";
      setError(msg);
      // fallback local para não travar a UI
      setDataState(refreshItemStatuses(loadData()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setData = useCallback(
    (updater: AppData | ((prev: AppData) => AppData)) => {
      setDataState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: AppData) => AppData)(prev)
            : updater;
        const refreshed = refreshItemStatuses(next);

        if (isSupabaseConfigured) {
          void persistAppDataToSupabase(refreshed).catch((err) => {
            console.error("[AuxPlus] Falha ao salvar no Supabase", err);
            setError(
              err instanceof Error
                ? err.message
                : "Falha ao salvar no Supabase",
            );
          });
        } else {
          saveData(refreshed);
        }

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
      if (isSupabaseConfigured) {
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
      }

      const found = data.users.find(
        (u) =>
          u.username.toLowerCase() === username.toLowerCase() &&
          u.password === password,
      );
      if (!found) return "Nome de usuário ou senha inválidos.";
      if (!found.isActive)
        return "Sua conta está desativada. Entre em contato com o suporte.";
      setSessionUserId(found.id);
      setSessionId(found.id);
      return null;
    },
    [data.users],
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
