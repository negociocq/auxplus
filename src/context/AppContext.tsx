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

interface AppContextValue {
  data: AppData;
  user: User | null;
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  login: (username: string, password: string) => string | null;
  logout: () => void;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(() =>
    refreshItemStatuses(loadData()),
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    getSessionUserId(),
  );

  const setData = useCallback(
    (updater: AppData | ((prev: AppData) => AppData)) => {
      setDataState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: AppData) => AppData)(prev)
            : updater;
        const refreshed = refreshItemStatuses(next);
        saveData(refreshed);
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
    (username: string, password: string) => {
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

  const refresh = useCallback(() => {
    setDataState(refreshItemStatuses(loadData()));
  }, []);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const value = useMemo(
    () => ({ data, user, setData, login, logout, refresh }),
    [data, user, setData, login, logout, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
