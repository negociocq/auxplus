import { useEffect, useRef } from "react";
import type { AppData, User } from "@/types";
import {
  pollAndReleaseMpOrders,
  revenueItemsFromData,
} from "@/lib/mpOrderAutoRelease";
import { loadAutomationsConfig } from "@/lib/automationsConfig";
import { loadMpOrders } from "@/lib/mercadoPagoOrders";

/**
 * Enquanto o app estiver aberto (qualquer tela), verifica PIX pendentes
 * e libera renovação / créditos / teste→plano + WhatsApp automaticamente.
 */
export function useMpOrderAutoRelease(
  user: User | null,
  data: AppData,
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void,
) {
  const busyRef = useRef(false);
  const dataRef = useRef(data);
  const setDataRef = useRef(setData);
  dataRef.current = data;
  setDataRef.current = setData;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || busyRef.current) return;
      const cfg = loadAutomationsConfig(user.id);
      if (!cfg.mpAccessToken.trim()) return;

      const local = loadMpOrders(user.id);
      const hasWork = local.some(
        (o) =>
          o.status === "pending" ||
          (o.status === "approved" && !o.releasedAt),
      );
      // Mesmo sem pending local, sincroniza nuvem de tempos em tempos
      // (webhook cria pedidos no Supabase).
      busyRef.current = true;
      try {
        await pollAndReleaseMpOrders({
          user,
          items: revenueItemsFromData(dataRef.current, user.id),
          setData: setDataRef.current,
          silent: true,
        });
        if (!hasWork) {
          /* ok — sync remoto pode ter trazido pedidos */
        }
      } catch {
        /* silencioso */
      } finally {
        busyRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 10_000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);
}
