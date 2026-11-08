/** Serializa o estado compartilhado da conta, inclusive entre instâncias Edge. */
export async function acquireBotLease(db: any, userId: string, waitMs = 20_000) {
  const name = `wa_bot_lease_${userId}`;
  const token = crypto.randomUUID();
  const staleMs = 5 * 60_000;
  const deadline = Date.now() + waitMs;
  while (true) {
    const now = new Date().toISOString();
    const inserted = await db.from("platform_private_secrets").insert({ name, value: { token }, updated_at: now });
    if (inserted.error && inserted.error.code !== "23505") throw new Error("Falha ao proteger o processamento do atendimento");
    let acquired = !inserted.error;
    if (!acquired) {
      const reclaimed = await db.from("platform_private_secrets")
        .update({ value: { token }, updated_at: now }).eq("name", name)
        .lt("updated_at", new Date(Date.now() - staleMs).toISOString()).select("name");
      if (reclaimed.error) throw new Error("Falha ao recuperar o processamento do atendimento");
      acquired = Boolean(reclaimed.data?.length);
    }
    if (acquired) {
      let lost = false;
      const heartbeat = setInterval(() => {
        void db.from("platform_private_secrets").update({ updated_at: new Date().toISOString() })
          .eq("name", name).eq("value->>token", token).select("name")
          .then((result: any) => { if (result.error || !result.data?.length) lost = true; }, () => { lost = true; });
      }, 30_000);
      return {
        assertHeld: () => { if (lost) throw new Error("Atendimento aguardando nova tentativa"); },
        release: async () => {
          clearInterval(heartbeat);
          await db.from("platform_private_secrets").delete().eq("name", name).eq("value->>token", token);
        },
      };
    }
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function isPausedConversation(
  phone: string,
  sessions: Record<string, { state?: string }>,
  paused: Record<string, boolean>,
  matches: (a: string, b: string) => boolean,
) {
  return Object.entries(paused).some(([key, value]) => value && matches(key, phone)) ||
    Object.entries(sessions).some(([key, session]) => session.state === "human" && matches(key, phone));
}

export function isRepeatedBotReply(
  previous: { body: string; at: number }[] | undefined,
  body: string,
  now = Date.now(),
) {
  return previous?.some((reply) => reply.body === body && now - reply.at < 60_000) || false;
}

export const HUMAN_IDLE_MS = 60 * 60_000;

/** Mutates only human sessions and their pause aliases, preserving trial history. */
export function expireHumanConversations(
  sessions: Record<string, { state?: string; updatedAt?: string; humanBusySent?: boolean; humanBusyAt?: string }>,
  paused: Record<string, boolean>,
  matches: (a: string, b: string) => boolean,
  now = Date.now(),
) {
  let changed = false;
  const phones = new Set([...Object.keys(paused).filter(p => paused[p]),
    ...Object.keys(sessions).filter(p => sessions[p].state === "human")]);
  for (const phone of phones) {
    if (!isPausedConversation(phone, sessions, paused, matches)) continue;
    const aliases = Object.keys(sessions).filter(p => matches(p, phone));
    const times = aliases.map(p => Date.parse(sessions[p].updatedAt || "")).filter(Number.isFinite);
    if (!times.length) {
      // Legacy pauses with no date get one full hour from the first observation.
      sessions[phone] = { ...sessions[phone], state: "human", updatedAt: new Date(now).toISOString() };
      changed = true;
      continue;
    }
    if (now - Math.max(...times) < HUMAN_IDLE_MS) continue;
    for (const p of Object.keys(paused)) if (matches(p, phone)) delete paused[p];
    for (const p of aliases) if (sessions[p].state === "human") {
      sessions[p] = { ...sessions[p], state: "idle", humanBusySent: undefined,
        humanBusyAt: undefined, updatedAt: new Date(now).toISOString() };
    }
    changed = true;
  }
  return changed;
}

/** Uses the existing five-minute server schedule, even with the app closed. */
export async function sweepHumanConversations(db: any) {
  const result = await db.from("platform_settings").select("key").like("key", "wa_bot_state_user_%");
  if (result.error) throw new Error("Falha ao listar atendimentos inativos");
  const canonical = (p: string) => {
    const digits = p.replace(/\D/g, "");
    return /^55\d{2}9\d{8}$/.test(digits) ? digits.slice(0, 4) + digits.slice(5) : digits;
  };
  for (const row of result.data || []) {
    const lease = await acquireBotLease(db, row.key.slice("wa_bot_state_user_".length), 0);
    if (!lease) continue;
    try {
      const fresh = await db.from("platform_settings").select("value").eq("key", row.key).maybeSingle();
      if (fresh.error) throw new Error("Falha ao ler atendimentos inativos");
      const state = typeof fresh.data?.value === "string" ? JSON.parse(fresh.data.value) : fresh.data?.value;
      if (!state) continue;
      state.sessions ||= {};
      state.humanPaused ||= {};
      if (!expireHumanConversations(state.sessions, state.humanPaused, (a, b) => canonical(a) === canonical(b))) continue;
      lease.assertHeld();
      const saved = await db.from("platform_settings").update({ value: state, updated_at: new Date().toISOString() }).eq("key", row.key);
      if (saved.error) throw new Error("Falha ao encerrar atendimentos inativos");
    } finally {
      await lease.release();
    }
  }
}
