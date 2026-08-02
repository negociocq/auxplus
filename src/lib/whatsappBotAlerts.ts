import { supabase } from "@/integrations/supabase/client";

export type WaHumanAlert = {
  id: string;
  phone: string;
  role?: "client" | "reseller" | "unknown" | string;
  at: string;
  /** true depois que o app mostrou a notificação */
  seen?: boolean;
};

export type WaBotAlertsStore = {
  alerts: WaHumanAlert[];
};

const alertsDbKey = (userId: string) => `wa_bot_alerts_user_${userId}`;

export function defaultWaBotAlerts(): WaBotAlertsStore {
  return { alerts: [] };
}

/** Formata celular BR para exibição (ex.: +55 71 99222-0323). */
export function formatWaPhoneDisplay(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return d ? `+${d}` : "—";
}

export async function loadWaBotAlertsRemote(
  userId: string,
): Promise<WaBotAlertsStore> {
  if (!supabase || !userId) return defaultWaBotAlerts();
  try {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", alertsDbKey(userId))
      .maybeSingle();
    if (!data?.value) return defaultWaBotAlerts();
    const raw =
      typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    const alerts = Array.isArray(raw?.alerts)
      ? (raw.alerts as WaHumanAlert[])
      : [];
    return { alerts };
  } catch {
    return defaultWaBotAlerts();
  }
}

export async function markWaBotAlertsSeenRemote(
  userId: string,
  ids: string[],
): Promise<void> {
  if (!supabase || !userId || !ids.length) return;
  const want = new Set(ids);
  const cur = await loadWaBotAlertsRemote(userId);
  const next = {
    alerts: cur.alerts.map((a) =>
      want.has(a.id) ? { ...a, seen: true } : a,
    ),
  };
  await supabase.from("platform_settings").upsert(
    {
      key: alertsDbKey(userId),
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

export { alertsDbKey as waBotAlertsDbKey };
