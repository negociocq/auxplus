export type TrialUse = { at: string; username?: string; name?: string; remoteId?: string | number; released?: boolean };
export function trialActivationExpired(session: { state?: string; testHours?: number; testUsername?: string }, used: TrialUse | null, now = Date.now()) {
  if (!["test_ask_name", "test_ask_device", "test_ask_phone_os", "test_ask_tv", "test_ask_app", "test_await_mac", "test_confirm_install"].includes(session.state || "") || !used) return false;
  const at = Date.parse(used.at);
  return !Number.isFinite(at) || now >= at + Math.max(1, Math.min(6, Number(session.testHours) || 6)) * 3600000;
}
export async function loadTrialUse(db: any, userId: string, phone: string, legacy: TrialUse | null): Promise<TrialUse | null> {
  const query = () => db.from("wa_trial_history").select("last_used_at,username,client_name,remote_id,allow_retest").eq("user_id", userId).eq("phone", phone).maybeSingle();
  let result = await query();
  if (result.error) throw Error("Não foi possível conferir o histórico de testes. Tente novamente ou digite atendente.");
  if (!result.data && legacy) {
    const inserted = await db.from("wa_trial_history").insert({ user_id: userId, phone, first_used_at: legacy.at, last_used_at: legacy.at, username: legacy.username, client_name: legacy.name, remote_id: legacy.remoteId == null ? null : String(legacy.remoteId), status: "consumed" });
    if (inserted.error && inserted.error.code !== "23505") throw Error("Não foi possível preservar o histórico do teste.");
    result = await query();
    if (result.error) throw Error("Não foi possível conferir o histórico do teste.");
  }
  const row = result.data;
  if (!row) return null;
  if (row.allow_retest) return { at: row.last_used_at, released: true };
  return { at: row.last_used_at, username: row.username || undefined, name: row.client_name || undefined, remoteId: row.remote_id || undefined };
}
export async function releaseTrialUse(db: any, userId: string, phone: string) {
  const result = await db.rpc("release_wa_trial", { p_user_id: userId, p_phone: phone });
  if (result.error) throw Error("Não foi possível liberar o teste. Tente novamente.");
}
export async function claimTrialUse(db: any, userId: string, phone: string): Promise<string> {
  const result = await db.rpc("claim_wa_trial", { p_user_id: userId, p_phone: phone });
  if (result.error) throw Error("Não foi possível conferir a liberação do teste. Digite atendente.");
  if (!result.data) throw Error("Este número já solicitou um teste. Somente o responsável pode liberar outro com o comando liberar teste.");
  return String(result.data);
}
export async function finishTrialUse(db: any, userId: string, phone: string, reservation: string, info: TrialUse) {
  const result = await db.from("wa_trial_history").update({ username: info.username, client_name: info.name, remote_id: info.remoteId == null ? null : String(info.remoteId), status: "consumed" }).eq("user_id", userId).eq("phone", phone).eq("reservation_id", reservation);
  if (result.error) throw Error("O teste foi criado, mas a confirmação do histórico falhou. Digite atendente; não solicite outro teste.");
}
