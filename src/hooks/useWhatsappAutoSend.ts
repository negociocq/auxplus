import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { AppData, User } from "@/types";
import {
  acquireWhatsappSendLock,
  buildTodayQueue,
  canSendMore,
  fetchEvolutionStatus,
  isPastSendTime,
  loadSendLog,
  loadWhatsappSettings,
  markWhatsappAttempt,
  nextDelayMs,
  releaseWhatsappSendLock,
  resolveWhatsappAttempt,
  sendEvolutionText,
  syncWhatsappAccountData,
  wasItemSentToday,
} from "@/lib/whatsappAutomation";
import {
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
} from "@/lib/platformApi";

const AUTO_FLAG = "auxplus-wa-auto-started";

function autoStartedKey(userId: string) {
  return `${AUTO_FLAG}:${userId}:${format(new Date(), "yyyy-MM-dd")}`;
}

function markAutoStarted(userId: string) {
  try {
    localStorage.setItem(autoStartedKey(userId), "1");
  } catch {
    /* ignore */
  }
}

function wasAutoStarted(userId: string) {
  try {
    return localStorage.getItem(autoStartedKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Envia a fila sozinho a partir do horário configurado.
 * Precisa do app aberto (aba logada) e WhatsApp conectado.
 */
export function useWhatsappAutoSend(user: User | null, data: AppData) {
  const runningRef = useRef(false);

  const myFolders = useMemo(
    () => (user ? data.folders.filter((f) => f.userId === user.id) : []),
    [data.folders, user],
  );
  const myItems = useMemo(
    () =>
      data.items.filter((i) => myFolders.some((f) => f.id === i.folderId)),
    [data.items, myFolders],
  );

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    let lastCloudSync = 0;
    const refreshCloud = async () => {
      const now = Date.now();
      if (now - lastCloudSync < 30_000) return;
      lastCloudSync = now;
      await syncWhatsappAccountData(user.id);
    };
    void refreshCloud();

    const tick = async () => {
      if (cancelled || runningRef.current) return;

      await refreshCloud();
      if (cancelled) return;

      const settings = loadWhatsappSettings(user.id);
      if (!settings.enabled) return;
      if (!isPastSendTime(settings.sendTime)) return;

      const logs = loadSendLog(user.id);
      const queue = buildTodayQueue(settings, myItems, myFolders, logs);
      if (queue.length === 0) return;

      const platform = await loadEvolutionPlatformConfig();
      if (!isEvolutionConfigured(platform)) return;

      const runtime = {
        apiBaseUrl: platform.apiBaseUrl,
        apiKey: platform.apiKey,
        instanceName: instanceNameForUser(
          platform.instancePrefix,
          user.id,
          user.username,
        ),
      };

      const status = await fetchEvolutionStatus(runtime);
      if (status !== "open") return;

      if (!acquireWhatsappSendLock()) return;
      runningRef.current = true;
      const firstToday = !wasAutoStarted(user.id);
      if (firstToday) {
        markAutoStarted(user.id);
        toast.message(
          `Envio automático iniciado (${queue.length} na fila)`,
        );
      }

      let sent = 0;
      try {
        for (const item of queue) {
          if (cancelled) break;
          const liveSettings = loadWhatsappSettings(user.id);
          if (!liveSettings.enabled) break;
          // Dedup na hora: se já foi enviado hoje, pula (fila pode estar velha).
          // Por telefone também: cliente duplicado em várias pastas não reenvia.
          if (wasItemSentToday(user.id, item.itemId, item.kind, item.phone))
            continue;

          const gate = canSendMore(liveSettings, loadSendLog(user.id));
          if (!gate.ok) {
            if (firstToday || sent > 0) {
              toast.message(gate.reason || "Aguardando limite anti-ban…");
            }
            break;
          }

          try {
            // Reserva a tentativa ANTES de enviar: se a resposta da Evolution se
            // perder após entregar (falsa falha), a reserva já bloqueia reenvio hoje.
            markWhatsappAttempt(user.id, item.phone, item.itemId, item.kind);
            await sendEvolutionText(runtime, item.phone, item.message);
            resolveWhatsappAttempt(user.id, item.phone, item.kind, true);
            sent += 1;
          } catch (e) {
            resolveWhatsappAttempt(
              user.id,
              item.phone,
              item.kind,
              false,
              e instanceof Error ? e.message : "erro",
            );
            toast.error(
              `Falha automática em ${item.name}: ${
                e instanceof Error ? e.message : "erro"
              }`,
            );
            break;
          }

          const remaining = queue.length - sent;
          if (remaining > 0) {
            await new Promise((r) =>
              setTimeout(r, nextDelayMs(loadWhatsappSettings(user.id))),
            );
          }
        }
        if (sent > 0) {
          toast.success(`Automático: ${sent} mensagem(ns) enviada(s)`);
        }
      } finally {
        runningRef.current = false;
        releaseWhatsappSendLock();
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 45000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, myFolders, myItems]);
}
