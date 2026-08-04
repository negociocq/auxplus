import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import type { AppData, User } from "@/types";
import { isRevenueFolderType } from "@/types";
import {
  isUniplayConnected,
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import {
  ensureIptvToken,
  fetchIptvPanelCredits,
  listIptvResellers,
} from "@/lib/iptvPanelApi";
import {
  isAtOrAfterLocalTime,
  loadNotificationSettings,
  loadNotificationSettingsRemote,
  patchNotificationLastNotified,
} from "@/lib/notificationSettings";
import {
  setAppBadgeCount,
  showLocalAlert,
} from "@/lib/localNotifications";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import {
  formatWaPhoneDisplay,
  loadWaBotAlertsRemote,
  markWaBotAlertsSeenRemote,
} from "@/lib/whatsappBotAlerts";

const CHECK_MS = 90_000;
/** Handoff WhatsApp → atendentes: poll mais curto */
const WA_HUMAN_CHECK_MS = 15_000;

function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

function countDueToday(user: User, data: AppData) {
  const folders = data.folders.filter(
    (f) => f.userId === user.id && isRevenueFolderType(f.type),
  );
  const folderIds = new Set(folders.map((f) => f.id));
  const ymd = todayKey();

  return data.items.filter((i) => {
    if (!folderIds.has(i.folderId) || !i.dueDate) return false;
    return String(i.dueDate).slice(0, 10) === ymd;
  }).length;
}

/**
 * Alertas locais do app (PWA/mobile) enquanto a sessão está aberta:
 * - quantos vencem hoje
 * - créditos UniPlay abaixo do limite
 * - revendedores com créditos no limite
 * - alguém pediu atendentes no WhatsApp
 */
export function useLocalAlerts(user: User | null, data: AppData) {
  const runningRef = useRef(false);
  const waRunningRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const userId = user?.id;

  const folderSignature = useMemo(() => {
    if (!user) return "";
    return data.folders
      .filter((f) => f.userId === user.id)
      .map((f) => f.id)
      .join(",");
  }, [data.folders, user]);

  const itemsSignature = useMemo(() => {
    if (!user) return "";
    return data.items
      .filter((i) =>
        data.folders.some(
          (f) => f.id === i.folderId && f.userId === user.id,
        ),
      )
      .map((i) => `${i.id}:${i.dueDate || ""}`)
      .join("|");
  }, [data.items, data.folders, user]);

  useEffect(() => {
    if (!user || !userId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;
      try {
        await loadNotificationSettingsRemote(userId).catch(() =>
          loadNotificationSettings(userId),
        );
        let settings = loadNotificationSettings(userId);
        if (!settings.enabled) {
          await setAppBadgeCount(0);
          return;
        }

        const dueCount = countDueToday(user, dataRef.current);
        await setAppBadgeCount(
          settings.dueTodayEnabled && dueCount > 0 ? dueCount : 0,
        );

        if (
          settings.dueTodayEnabled &&
          dueCount > 0 &&
          isAtOrAfterLocalTime(settings.dueTodayTime)
        ) {
          // 1× por dia, a partir do horário configurado (ex.: 08:00)
          const dueKey = `${todayKey()}@${settings.dueTodayTime}`;
          if (settings.lastNotified.dueKey !== dueKey) {
            await showLocalAlert({
              title:
                dueCount === 1
                  ? "1 vencimento hoje"
                  : `${dueCount} vencimentos hoje`,
              body:
                dueCount === 1
                  ? "Há 1 item com vencimento hoje nas suas pastas."
                  : `Há ${dueCount} itens com vencimento hoje nas suas pastas.`,
              tag: "auxplus-due-today",
              url: "/dashboard",
            }, { userId });
            patchNotificationLastNotified(userId, { dueKey });
            settings = loadNotificationSettings(userId);
          }
        }

        const needIptv =
          settings.userCreditsEnabled || settings.resellerCreditsEnabled;
        if (!needIptv) return;

        const cfg = await loadAutomationsConfigRemote(userId).catch(() =>
          loadAutomationsConfig(userId),
        );
        if (!isUniplayConnected(cfg)) return;

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
        const creds = {
          apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
          bearerToken: ensured.token,
          username: cfg.iptvUsername || undefined,
          password: cfg.iptvPassword || undefined,
          defaultPackage: plat.packageId || "1",
          regPassword: plat.regPassword || undefined,
          apiProxyUrl: plat.apiProxyUrl || undefined,
        };

        if (settings.userCreditsEnabled) {
          try {
            const bal = await fetchIptvPanelCredits(creds);
            const credits = bal.credits;
            const thr = settings.userCreditsThreshold;
            if (typeof credits === "number" && credits < thr) {
              const userKey = `${todayKey()}:below:${thr}:${credits}`;
              // Reavisa no dia se o saldo cair de novo, mas não a cada poll com o mesmo valor
              const prev = settings.lastNotified.userCreditsKey || "";
              const sameLevel =
                prev.startsWith(`${todayKey()}:below:${thr}:`) &&
                prev === userKey;
              if (!sameLevel) {
                await showLocalAlert({
                  title: "Créditos UniPlay baixos",
                  body: `Seu saldo está em ${credits} (abaixo de ${thr}).`,
                  tag: "auxplus-user-credits",
                  url: "/automations",
                }, { userId });
                patchNotificationLastNotified(userId, {
                  userCreditsKey: userKey,
                });
                settings = loadNotificationSettings(userId);
              }
            } else if (typeof credits === "number" && credits >= thr) {
              // Limpa dedup do dia quando volta ao normal (permite novo aviso se cair de novo)
              if (settings.lastNotified.userCreditsKey?.includes(":below:")) {
                patchNotificationLastNotified(userId, {
                  userCreditsKey: `${todayKey()}:ok:${credits}`,
                });
                settings = loadNotificationSettings(userId);
              }
            }
          } catch {
            /* UniPlay indisponível — ignora neste ciclo */
          }
        }

        if (settings.resellerCreditsEnabled) {
          try {
            const rows = await listIptvResellers(creds);
            const thr = settings.resellerCreditsThreshold;
            const low = rows.filter(
              (r) =>
                typeof r.credits === "number" &&
                Number.isFinite(r.credits) &&
                r.credits <= thr,
            );
            if (low.length) {
              const ids = low
                .map((r) => String(r.id ?? r.username))
                .sort()
                .join(",");
              const resellerKey = `${todayKey()}:<=${thr}:${ids}`;
              if (settings.lastNotified.resellerKey !== resellerKey) {
                const names = low
                  .slice(0, 4)
                  .map((r) => r.username || r.name || String(r.id))
                  .join(", ");
                const extra =
                  low.length > 4 ? ` e mais ${low.length - 4}` : "";
                await showLocalAlert({
                  title:
                    low.length === 1
                      ? "Revendedor com créditos baixos"
                      : `${low.length} revendedores com créditos baixos`,
                  body: `${names}${extra} com ≤ ${thr} crédito(s).`,
                  tag: "auxplus-reseller-credits",
                  url: "/automations",
                }, { userId });
                patchNotificationLastNotified(userId, { resellerKey });
              }
            }
          } catch {
            /* lista indisponível */
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, userId, folderSignature, itemsSignature]);

  useEffect(() => {
    if (!user || !userId) return;

    let cancelled = false;

    const tickWa = async () => {
      if (cancelled || waRunningRef.current) return;
      waRunningRef.current = true;
      try {
        await loadNotificationSettingsRemote(userId).catch(() =>
          loadNotificationSettings(userId),
        );
        const settings = loadNotificationSettings(userId);
        if (!settings.enabled || !settings.whatsappHumanEnabled) return;

        const bag = await loadWaBotAlertsRemote(userId);
        const pending = bag.alerts.filter((a) => a && a.id && !a.seen);
        if (!pending.length) return;

        const seenIds: string[] = [];
        for (const alert of pending) {
          const phoneLabel = formatWaPhoneDisplay(alert.phone);
          const roleLabel =
            alert.role === "reseller"
              ? "Revendedor"
              : alert.role === "client"
                ? "Cliente"
                : "Contato";
          await showLocalAlert({
            title: "Pessoa no atendimento",
            body: `${roleLabel} pediu atendentes · ${phoneLabel}`,
            tag: `auxplus-wa-human-${alert.id}`,
            url: "/whatsapp",
          }, { userId });
          seenIds.push(alert.id);
        }
        if (seenIds.length) {
          await markWaBotAlertsSeenRemote(userId, seenIds).catch(() => undefined);
        }
      } finally {
        waRunningRef.current = false;
      }
    };

    void tickWa();
    const id = window.setInterval(() => void tickWa(), WA_HUMAN_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tickWa();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, userId]);
}
