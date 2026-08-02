/**
 * Proxy Mercado Pago PIX (Checkout Transparente via Orders API).
 * Body: { action: "create"|"status"|"ping", accessToken?, ... }
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mp-access-token",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mpErrorMessage(data: Record<string, unknown>, status: number) {
  const details = Array.isArray(data.details) ? data.details : [];
  const detailsText = details
    .map((d) => {
      if (typeof d === "string") return d;
      if (!d || typeof d !== "object") return "";
      const row = d as Record<string, unknown>;
      return String(
        row.message || row.description || row.code || JSON.stringify(row),
      );
    })
    .filter(Boolean)
    .join("; ");

  const cause = Array.isArray(data.cause) ? data.cause : [];
  const causeText = cause
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const row = c as Record<string, unknown>;
      return String(row.description || row.message || row.code || "");
    })
    .filter(Boolean)
    .join("; ");

  const errors = Array.isArray(data.errors) ? data.errors : [];
  const errorsText = errors
    .map((e) => {
      if (!e || typeof e !== "object") return String(e || "");
      const row = e as Record<string, unknown>;
      return String(row.message || row.code || "");
    })
    .filter(Boolean)
    .join("; ");

  return (
    detailsText ||
    String(data.message || "") ||
    String(data.error || "") ||
    causeText ||
    errorsText ||
    `MP HTTP ${status}`
  );
}

function amountStr(amount: number) {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/** MP limita external_reference; evita :, espaços, etc. */
function cleanExternalRef(raw: string) {
  return String(raw || `auxplus_${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
}

function pickDateOfExpiration(
  payment?: Record<string, unknown>,
  data?: Record<string, unknown>,
): string | undefined {
  for (const raw of [
    payment?.date_of_expiration,
    payment?.dateOfExpiration,
    data?.date_of_expiration,
    data?.dateOfExpiration,
  ]) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return undefined;
}

function extractPixFromOrder(data: Record<string, unknown>) {
  const tx = (data.transactions || {}) as {
    payments?: Array<Record<string, unknown>>;
  };
  const payment = Array.isArray(tx.payments) ? tx.payments[0] : undefined;
  const pm = (payment?.payment_method || {}) as Record<string, unknown>;
  const status = String(
    payment?.status || data.status || "pending",
  ).toLowerCase();
  return {
    id: String(data.id || ""),
    paymentId: payment?.id ? String(payment.id) : undefined,
    status,
    status_detail: String(
      payment?.status_detail || data.status_detail || "",
    ),
    qr_code: String(pm.qr_code || ""),
    qr_code_base64: String(pm.qr_code_base64 || ""),
    ticket_url: String(pm.ticket_url || ""),
    date_of_expiration: pickDateOfExpiration(payment, data),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accessToken = String(
      req.headers.get("x-mp-access-token") || body.accessToken || "",
    ).trim();
    if (!accessToken) {
      return json({ error: "Informe o Access Token do Mercado Pago" }, 400);
    }

    const action = String(body.action || "").trim();
    const mpHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (action === "ping") {
      const upstream = await fetch("https://api.mercadopago.com/users/me", {
        headers: mpHeaders,
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!upstream.ok) {
        return json(
          { error: mpErrorMessage(data, upstream.status) },
          upstream.status,
        );
      }
      return json({
        ok: true,
        id: data.id,
        nickname: data.nickname,
        email: data.email,
      });
    }

    if (action === "create") {
      const amount = Number(body.amount);
      const payerEmail = String(body.payerEmail || "").trim();
      const externalReference = cleanExternalRef(
        String(body.externalReference || ""),
      );
      if (!Number.isFinite(amount) || amount < 1) {
        return json({ error: "amount inválido" }, 400);
      }
      if (!payerEmail.includes("@")) {
        return json({ error: "payerEmail inválido" }, 400);
      }

      const value = amountStr(amount);
      // Padrão MP = 24h; mínimo 30min, máximo 30 dias (ISO 8601 duration)
      const expirationTime = String(body.expirationTime || "PT24H").trim() ||
        "PT24H";
      // Payload mínimo oficial do PIX (Orders API)
      const orderBody = {
        type: "online",
        total_amount: value,
        external_reference: externalReference,
        processing_mode: "automatic",
        transactions: {
          payments: [
            {
              amount: value,
              expiration_time: expirationTime,
              payment_method: {
                id: "pix",
                type: "bank_transfer",
              },
            },
          ],
        },
        payer: {
          email: payerEmail,
        },
      };

      const upstream = await fetch("https://api.mercadopago.com/v1/orders", {
        method: "POST",
        headers: {
          ...mpHeaders,
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(orderBody),
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!upstream.ok) {
        return json(
          {
            error: mpErrorMessage(data, upstream.status),
            code: data.code || null,
            details: data.details || data.cause || data.errors || null,
          },
          upstream.status,
        );
      }

      const pix = extractPixFromOrder(data);
      if (!pix.qr_code) {
        return json(
          {
            error:
              "Pedido criado, mas o Mercado Pago não retornou o QR PIX. Cadastre uma chave Pix na conta MP.",
            id: pix.id,
            paymentId: pix.paymentId,
            status: pix.status,
          },
          502,
        );
      }
      return json({
        id: pix.id,
        paymentId: pix.paymentId,
        status: pix.status,
        status_detail: pix.status_detail,
        qr_code: pix.qr_code,
        qr_code_base64: pix.qr_code_base64,
        ticket_url: pix.ticket_url,
        date_of_expiration: pix.date_of_expiration || null,
      });
    }

    if (action === "status") {
      const paymentId = String(body.paymentId || "").trim();
      if (!paymentId) return json({ error: "Informe paymentId" }, 400);

      // Preferimos Orders API (ids ORD…). Fallback Payments API (ids numéricos / PAY…).
      const orderRes = await fetch(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(paymentId)}`,
        { headers: mpHeaders },
      );
      const orderData = (await orderRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (orderRes.ok) {
        const pix = extractPixFromOrder(orderData);
        return json({
          id: pix.id || paymentId,
          status: pix.status,
          status_detail: pix.status_detail,
          date_of_expiration: pix.date_of_expiration || null,
        });
      }

      const payRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        { headers: mpHeaders },
      );
      const payData = (await payRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!payRes.ok) {
        return json(
          {
            error: mpErrorMessage(
              Object.keys(orderData).length ? orderData : payData,
              orderRes.status || payRes.status,
            ),
          },
          payRes.status || orderRes.status,
        );
      }
      return json({
        id: String(payData.id || paymentId),
        status: String(payData.status || "pending"),
        status_detail: String(payData.status_detail || ""),
        date_of_expiration: pickDateOfExpiration(payData, payData) || null,
      });
    }

    return json({ error: 'action deve ser "create", "status" ou "ping"' }, 400);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Falha no proxy MP" },
      502,
    );
  }
});
