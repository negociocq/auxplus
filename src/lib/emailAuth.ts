import { supabase } from "@/integrations/supabase/client";

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function redirectTo(path: string) {
  return `${window.location.origin}${path}`;
}

const CONFIRM_PATH = "/auth/confirm";

/** Cadastro novo: cria usuário no Auth e dispara e-mail de confirmação do Supabase. */
export async function sendSignupConfirmationEmail(
  email: string,
  password: string,
  meta?: { username?: string; appUserId?: string },
): Promise<{ error?: string }> {
  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: {
      data: {
        username: meta?.username,
        app_user_id: meta?.appUserId,
      },
      emailRedirectTo: redirectTo(CONFIRM_PATH),
    },
  });

  if (!error) return {};

  if (/already|registered|exists/i.test(error.message)) {
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: normalized,
      options: { emailRedirectTo: redirectTo(CONFIRM_PATH) },
    });
    if (resendErr) return { error: resendErr.message };
    return {};
  }

  return { error: error.message };
}

/** Conta antiga sem e-mail: envia magic link; o e-mail só grava após o clique. */
export async function sendLinkEmailConfirmation(
  email: string,
  meta?: { username?: string; appUserId?: string },
): Promise<{ error?: string }> {
  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      data: {
        username: meta?.username,
        app_user_id: meta?.appUserId,
      },
      emailRedirectTo: redirectTo(CONFIRM_PATH),
    },
  });
  if (error) return { error: error.message };
  return {};
}

async function ensureAuthSessionFromUrl() {
  const href = window.location.href;
  const url = new URL(href);

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: error.message };
    return {};
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (hash) {
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) return { error: error.message };
      return {};
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) return { error: error.message };
  if (!data.session) {
    return { error: "Link inválido ou expirado. Solicite um novo e-mail." };
  }
  return {};
}

/**
 * Após o clique no link: promove pending_email → email na tabela users.
 * Só neste momento o e-mail fica gravado de forma definitiva.
 */
export async function finalizeEmailConfirmation(): Promise<{
  email?: string;
  appUserId?: string;
  error?: string;
}> {
  const sessionResult = await ensureAuthSessionFromUrl();
  if (sessionResult.error) return { error: sessionResult.error };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return {
      error:
        userError?.message ||
        "Não foi possível confirmar o e-mail. Tente novamente.",
    };
  }

  const email = userData.user.email.trim().toLowerCase();
  const metaId = userData.user.user_metadata?.app_user_id;
  const appUserId = metaId != null && String(metaId).trim()
    ? String(metaId).trim()
    : undefined;

  const payload = { email, pending_email: null as string | null };

  if (appUserId) {
    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", Number(appUserId))
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) {
      return { error: "Conta AuxPlus não encontrada para vincular o e-mail." };
    }
    return { email, appUserId: String(data.id) };
  }

  const { data, error } = await supabase
    .from("users")
    .update(payload)
    .eq("pending_email", email)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return {
      error:
        "Nenhuma conta aguardando este e-mail. Faça login e solicite de novo em Configuração.",
    };
  }
  return { email, appUserId: String(data.id) };
}
