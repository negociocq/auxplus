type Bag = Record<string, any>;
const maps = ['sessions', 'humanPaused', 'testConsumed', 'recentMsgIds', 'lastSendAtByPhone', 'recentRepliesByPhone', 'optOut'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Apply only this request's changes; preserve concurrently updated conversations. */
export function mergeConversationState(current: Bag, baseline: Bag, next: Bag, now = Date.now()): Bag {
  const merged = { ...current };
  for (const field of maps) {
    const before = baseline[field] || {}, after = next[field] || {};
    const target = { ...(current[field] || {}) };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (same(before[key], after[key])) continue;
      if (!(key in after)) {
        if (same(target[key], before[key])) delete target[key];
      } else target[key] = after[key];
    }
    merged[field] = target;
  }
  const previousLog = new Set((baseline.botSendLog || []).map((row: unknown) => JSON.stringify(row)));
  const log = [...(current.botSendLog || []), ...(next.botSendLog || []).filter((row: unknown) => !previousLog.has(JSON.stringify(row)))];
  const unique = new Map(log.map(row => [JSON.stringify(row), row]));
  merged.botSendLog = [...unique.values()].filter(row => Date.parse(row.at) >= now - 86400000).slice(-400);
  return merged;
}

/** Only the brief state merge uses the account lock; network work uses a chat lock. */
export async function persistConversationState(
  db: any, userId: string, baseline: Bag, next: Bag,
  acquire: (db: any, id: string) => Promise<any>,
) {
  const lease = await acquire(db, userId);
  if (!lease) throw new Error('Estado do atendimento ocupado; tentar novamente');
  try {
    const key = `wa_bot_state_user_${userId}`;
    const read = await db.from('platform_settings').select('value').eq('key', key).maybeSingle();
    if (read.error) throw new Error('Falha ao ler estado do atendimento');
    const raw = read.data?.value;
    const current = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const value = mergeConversationState(current, baseline, next);
    lease.assertHeld();
    const saved = await db.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (saved.error) throw new Error('Falha ao salvar estado do atendimento');
    return structuredClone(next);
  } finally { await lease.release(); }
}
