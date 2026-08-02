import { supabase } from "@/integrations/supabase/client";

export interface NotificationSettings {
  /** Liga o sistema de alertas locais (PWA/mobile) */
  enabled: boolean;
  dueTodayEnabled: boolean;
  /**
   * Horário local (HH:mm) para enviar o resumo dos vencimentos do dia.
   * Ex.: "08:00" — só dispara a partir desse horário, 1× por dia.
   */
  dueTodayTime: string;
  userCreditsEnabled: boolean;
  resellerCreditsEnabled: boolean;
  /** Avisa no celular quando alguém pedir atendentes no WhatsApp */
  whatsappHumanEnabled: boolean;
  /** Avisa quando seus créditos UniPlay ficarem abaixo deste valor */
  userCreditsThreshold: number;
  /** Avisa quando um revendedor ficar com créditos ≤ este valor */
  resellerCreditsThreshold: number;
  /** Controles internos de deduplicação (não editar na UI) */
  lastNotified: {
    dueKey?: string;
    userCreditsKey?: string;
    resellerKey?: string;
  };
}

const SETTINGS_KEY = "auxplus-notifications";
const dbKey = (userId: string) => `notif_settings_user_${userId}`;

export function defaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    dueTodayEnabled: true,
    dueTodayTime: "08:00",
    userCreditsEnabled: true,
    resellerCreditsEnabled: true,
    whatsappHumanEnabled: true,
    userCreditsThreshold: 10,
    resellerCreditsThreshold: 2,
    lastNotified: {},
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Normaliza "8:00", "08:00:00" → "08:00" */
export function normalizeTimeHHmm(
  value: unknown,
  fallback = "08:00",
): string {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return fallback;
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function isAtOrAfterLocalTime(hhmm: string, now = new Date()): boolean {
  const t = normalizeTimeHHmm(hhmm);
  const [h, m] = t.split(":").map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= h * 60 + m;
}

export function normalizeNotificationSettings(
  base: NotificationSettings,
  parsed: Partial<NotificationSettings>,
): NotificationSettings {
  return {
    enabled: parsed.enabled !== false,
    dueTodayEnabled: parsed.dueTodayEnabled !== false,
    dueTodayTime: normalizeTimeHHmm(
      parsed.dueTodayTime,
      base.dueTodayTime || "08:00",
    ),
    userCreditsEnabled: parsed.userCreditsEnabled !== false,
    resellerCreditsEnabled: parsed.resellerCreditsEnabled !== false,
    whatsappHumanEnabled: parsed.whatsappHumanEnabled !== false,
    userCreditsThreshold: clampInt(
      parsed.userCreditsThreshold,
      base.userCreditsThreshold,
      0,
      999_999,
    ),
    resellerCreditsThreshold: clampInt(
      parsed.resellerCreditsThreshold,
      base.resellerCreditsThreshold,
      0,
      999_999,
    ),
    lastNotified: {
      ...(base.lastNotified || {}),
      ...(parsed.lastNotified || {}),
    },
  };
}

function writeLocal(userId: string, settings: NotificationSettings) {
  try {
    localStorage.setItem(`${SETTINGS_KEY}:${userId}`, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadNotificationSettings(
  userId: string,
): NotificationSettings {
  const base = defaultNotificationSettings();
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY}:${userId}`);
    if (!raw) return base;
    return normalizeNotificationSettings(
      base,
      JSON.parse(raw) as Partial<NotificationSettings>,
    );
  } catch {
    return base;
  }
}

async function persistRemote(userId: string, settings: NotificationSettings) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: dbKey(userId),
        value: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local já salvo */
  }
}

export async function loadNotificationSettingsRemote(
  userId: string,
): Promise<NotificationSettings> {
  const local = loadNotificationSettings(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", dbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      void persistRemote(userId, local);
      return local;
    }
    const value =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<NotificationSettings>)
        : (data.value as Partial<NotificationSettings>);
    const merged = normalizeNotificationSettings(local, value);
    writeLocal(userId, merged);
    return merged;
  } catch {
    return local;
  }
}

export function saveNotificationSettings(
  userId: string,
  settings: NotificationSettings,
) {
  const clean = normalizeNotificationSettings(
    defaultNotificationSettings(),
    settings,
  );
  writeLocal(userId, clean);
  void persistRemote(userId, clean);
}

/** Atualiza só o bloco lastNotified sem sobrescrever preferências da UI. */
export function patchNotificationLastNotified(
  userId: string,
  patch: NotificationSettings["lastNotified"],
) {
  const cur = loadNotificationSettings(userId);
  saveNotificationSettings(userId, {
    ...cur,
    lastNotified: { ...cur.lastNotified, ...patch },
  });
}
