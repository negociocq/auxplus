import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";

const storageKey = "auxplus-admin-session-v1";
const endpoint = `${SUPABASE_URL}/functions/v1/admin-photo-config`;
const headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

export function getAdminSessionToken(userId: string): string | null {
  try {
    const session = JSON.parse(localStorage.getItem(storageKey) || "null");
    return session?.userId === userId && Date.parse(session.expiresAt) > Date.now() ? session.token : null;
  } catch { return null; }
}

export async function startAdminSession(username: string, password: string): Promise<void> {
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ action: "login", username, password }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível iniciar a sessão administrativa.");
  localStorage.setItem(storageKey, JSON.stringify({ token: result.token, userId: result.userId, expiresAt: result.expiresAt }));
}

export function endAdminSession(): void {
  let token: string | undefined;
  try { token = JSON.parse(localStorage.getItem(storageKey) || "null")?.token; } catch { /* no session */ }
  localStorage.removeItem(storageKey);
  if (token) void fetch(endpoint, { method: "POST", headers: { ...headers, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "logout" }), keepalive: true }).catch(() => undefined);
}
