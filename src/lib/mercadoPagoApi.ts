import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";

export type CreatePixResult = {
  id: string;
  status: string;
  qr_code: string;
  qr_code_base64?: string;
  ticket_url?: string;
};

export type PixStatusResult = {
  id: string;
  status: string;
  status_detail?: string;
};

function mpProxyUrl() {
  return `${SUPABASE_URL}/functions/v1/mp-pix`;
}

/** Public Key tem formato UUID; Access Token é bem mais longo. */
export function looksLikeMpPublicKey(token: string): boolean {
  return /^APP_USR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    token.trim(),
  );
}

export function assertMpAccessToken(token: string): string {
  const t = token.trim();
  if (!t) throw new Error("Informe o Access Token do Mercado Pago");
  if (looksLikeMpPublicKey(t)) {
    throw new Error(
      "Você colou a Public Key. No painel do MP, copie o Access Token (Produção → Credenciais → Ver dados).",
    );
  }
  if (!t.startsWith("APP_USR-") && !t.startsWith("TEST-")) {
    throw new Error(
      "Access Token inválido. Deve começar com APP_USR- (produção) ou TEST- (teste).",
    );
  }
  if (t.length < 40) {
    throw new Error(
      "Access Token parece incompleto. Abra “Ver dados da credencial” e copie o Access Token inteiro.",
    );
  }
  return t;
}

function friendlyMpError(
  raw: string,
  status: number,
  extra?: { code?: unknown; details?: unknown },
): string {
  const msg = raw.trim();
  if (/unauthorized use of live credentials/i.test(msg)) {
    return "Mercado Pago recusou o token (Unauthorized use of live credentials). Confira se colou o Access Token de Produção (não a Public Key) e se as credenciais de produção estão ativadas no app AuxPlus.";
  }
  if (/invalid value for property|property_value/i.test(msg)) {
    const detail =
      typeof extra?.details === "string"
        ? extra.details
        : Array.isArray(extra?.details)
          ? JSON.stringify(extra.details)
          : "";
    return detail
      ? `Mercado Pago: valor inválido — ${detail}`
      : "Mercado Pago: valor inválido em algum campo do PIX. Confira e-mail do pagador e tente de novo.";
  }
  if (status === 401) {
    return msg || "Não autorizado pelo Mercado Pago (401). Verifique o Access Token.";
  }
  return msg || `Falha Mercado Pago (${status})`;
}

async function authHeaders(accessToken: string): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    "x-mp-access-token": accessToken.trim(),
  };
  try {
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    else headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  } catch {
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

/** Cria cobrança PIX no Mercado Pago (via Edge Function). */
export async function createMercadoPagoPix(opts: {
  accessToken: string;
  amount: number;
  description: string;
  payerEmail: string;
  externalReference: string;
}): Promise<CreatePixResult> {
  const token = assertMpAccessToken(opts.accessToken);
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Valor do PIX inválido (mínimo R$ 1,00)");
  }
  const email = opts.payerEmail.trim();
  if (!email || !email.includes("@")) {
    throw new Error("Informe um e-mail válido para o pagador (Mercado Pago)");
  }

  const res = await fetch(mpProxyUrl(), {
    method: "POST",
    headers: await authHeaders(token),
    body: JSON.stringify({
      action: "create",
      accessToken: token,
      amount,
      description: opts.description.trim() || "Renovação IPTV",
      payerEmail: email,
      externalReference: opts.externalReference,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      friendlyMpError(String(data.error || data.message || ""), res.status, {
        code: data.code,
        details: data.details,
      }),
    );
  }
  const qr = String(data.qr_code || "").trim();
  if (!qr) throw new Error("Mercado Pago não retornou o código PIX");
  return {
    id: String(data.id),
    status: String(data.status || "pending"),
    qr_code: qr,
    qr_code_base64: data.qr_code_base64
      ? String(data.qr_code_base64)
      : undefined,
    ticket_url: data.ticket_url ? String(data.ticket_url) : undefined,
  };
}

/** Consulta status do pagamento. */
export async function fetchMercadoPagoPaymentStatus(opts: {
  accessToken: string;
  paymentId: string;
}): Promise<PixStatusResult> {
  const token = assertMpAccessToken(opts.accessToken);
  const res = await fetch(mpProxyUrl(), {
    method: "POST",
    headers: await authHeaders(token),
    body: JSON.stringify({
      action: "status",
      accessToken: token,
      paymentId: opts.paymentId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      friendlyMpError(
        String(data.error || data.message || ""),
        res.status,
      ),
    );
  }
  return {
    id: String(data.id || opts.paymentId),
    status: String(data.status || "unknown"),
    status_detail: data.status_detail
      ? String(data.status_detail)
      : undefined,
  };
}

export function mapMpStatusToOrder(
  status: string,
): "pending" | "approved" | "cancelled" | "rejected" | "expired" {
  const s = status.toLowerCase();
  // Orders API + Payments API
  if (
    s === "approved" ||
    s === "processed" ||
    s === "paid" ||
    s === "accredited"
  ) {
    return "approved";
  }
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "rejected" || s === "failed") return "rejected";
  if (s === "expired") return "expired";
  // action_required / waiting_transfer / pending / created
  return "pending";
}

/** Valida o Access Token no Mercado Pago (GET /users/me). */
export async function pingMercadoPago(accessToken: string): Promise<{
  id?: string | number;
  nickname?: string;
  email?: string;
}> {
  const token = assertMpAccessToken(accessToken);
  const res = await fetch(mpProxyUrl(), {
    method: "POST",
    headers: await authHeaders(token),
    body: JSON.stringify({ action: "ping", accessToken: token }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      friendlyMpError(String(data.error || data.message || ""), res.status),
    );
  }
  return {
    id: data.id as string | number | undefined,
    nickname: data.nickname ? String(data.nickname) : undefined,
    email: data.email ? String(data.email) : undefined,
  };
}
