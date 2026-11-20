/** Serializa o estado compartilhado da conta, inclusive entre instâncias Edge. */
export async function acquireBotLease(db: any, userId: string) {
  const name = `wa_bot_lease_${userId}`;
  const token = crypto.randomUUID();
  const staleMs = 5 * 60_000;
  const deadline = Date.now() + 20_000;
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
