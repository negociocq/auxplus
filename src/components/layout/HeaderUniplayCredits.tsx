import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins } from "lucide-react";
import type { User } from "@/types";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import {
  ensureIptvToken,
  fetchIptvPanelCredits,
  formatIptvCredits,
} from "@/lib/iptvPanelApi";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import { onUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  user: User | null;
  hideBalance?: boolean;
};

/**
 * Saldo UniPlay na barra superior (ao lado da busca).
 */
export function HeaderUniplayCredits({ user, hideBalance }: Props) {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setCredits(null);
      setConnected(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const cfg = await loadAutomationsConfigRemote(user.id).catch(() =>
          loadAutomationsConfig(user.id),
        );
        if (!isUniplayConnected(cfg)) {
          if (!cancelled) {
            setCredits(null);
            setConnected(false);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setLoading(true);
        const plat = await loadIptvPlatformConfig();
        const ensured = await ensureIptvToken({
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: cfg.iptvBearerToken?.trim() || "",
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        const bal = await fetchIptvPanelCredits({
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: ensured.token,
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        });
        if (!cancelled) {
          setCredits(bal.credits);
          setConnected(true);
        }
      } catch {
        if (!cancelled) {
          setCredits(null);
          setConnected(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 120_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const offCredits = onUniplayCreditsChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      offCredits();
    };
  }, [user]);

  if (!connected && !loading) return null;

  const value =
    hideBalance
      ? "••••"
      : loading && credits == null
        ? "…"
        : formatIptvCredits(credits ?? 0);

  const positive = typeof credits === "number" && credits > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => navigate("/automations")}
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-left shadow-sm transition hover:bg-accent sm:gap-2 sm:px-3",
            positive
              ? "border-success/30 bg-success/5"
              : "bg-card",
          )}
          aria-label={`Créditos UniPlay: ${value}`}
        >
          <Coins className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:block">
              Créditos
            </span>
            <span className="text-sm font-semibold tabular-nums tracking-tight">
              {value}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Créditos UniPlay — abrir UniPlay</TooltipContent>
    </Tooltip>
  );
}
