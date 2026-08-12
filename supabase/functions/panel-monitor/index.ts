/**
 * Edge Function: Monitora painel e notifica clientes quando volta online
 *
 * Roda a cada 2 minutos via cron
 * Se painel estava offline e voltou: envia WhatsApp para todos que reportaram
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const PANEL_URL = "http://localhost:32116";
const HEALTH_CHECK_ENDPOINT = "/ges-api/recargas/credits";
const HEALTH_CHECK_TIMEOUT = 3000;

interface PanelDownReport {
  phone: string;
  name?: string;
  reportedAt: string;
  userId: string;
  problemType?: 'assist' | 'payment' | 'other';
}

interface PanelMonitoringState {
  isDown: boolean;
  wentDownAt?: string;
  clientsReporting: PanelDownReport[];
  notificationsSent?: Record<string, string>;
  lastCheckAt?: string;
}

/**
 * Faz health check do painel.
 */
async function checkPanelHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${PANEL_URL}${HEALTH_CHECK_ENDPOINT}`, {
      method: "GET",
      signal: controller.signal,
      credentials: "omit",
    });

    clearTimeout(timeoutId);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Envia notificação para admin quando painel fica offline.
 */
async function notifyAdminPanelDown(
  supabase: any,
  userId: string
): Promise<void> {
  try {
    // Busca número do admin (salvo em platform_settings)
    const { data: adminData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", `admin_notification_phone_${userId}`)
      .maybeSingle();

    if (!adminData?.value) {
      console.log(`[notifyAdminPanelDown] Sem número de admin para userId ${userId}`);
      return;
    }

    const adminPhone =
      typeof adminData.value === "string"
        ? adminData.value
        : adminData.value.phone;

    if (!adminPhone) {
      console.log(`[notifyAdminPanelDown] Número de admin vazio para userId ${userId}`);
      return;
    }

    // Busca credentials Evolution
    const { data: settingsData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", `wa_evolution_user_${userId}`)
      .maybeSingle();

    if (!settingsData?.value) {
      console.log(`[notifyAdminPanelDown] Sem credentials Evolution para userId ${userId}`);
      return;
    }

    const settings =
      typeof settingsData.value === "string"
        ? JSON.parse(settingsData.value)
        : settingsData.value;

    const apiUrl = settings.apiBaseUrl;
    const apiKey = settings.apiKey;
    const instance = settings.instanceName;

    if (!apiUrl || !apiKey || !instance) {
      console.log(`[notifyAdminPanelDown] Credentials incompletas para userId ${userId}`);
      return;
    }

    const adminMessage =
      "🚨 ALERTA: UniPlay está OFFLINE\n\n" +
      "⏰ " + new Date().toLocaleString("pt-BR") + "\n" +
      "📍 Não conseguindo se comunicar com painel\n" +
      "⚠️ Clientes estão sendo notificados\n\n" +
      "Verifique e repare o servidor!";

    const sent = await sendEvolutionMessage(
      apiUrl,
      apiKey,
      instance,
      adminPhone,
      adminMessage
    );

    if (sent) {
      console.log(
        `[notifyAdminPanelDown] ✅ Notificação enviada para admin ${adminPhone}`
      );
    } else {
      console.log(
        `[notifyAdminPanelDown] ❌ Falha ao enviar para admin ${adminPhone}`
      );
    }
  } catch (error) {
    console.error(`[notifyAdminPanelDown] Erro:`, error);
  }
}

/**
 * Envia notificação para admin quando painel volta online.
 */
async function notifyAdminPanelBack(
  supabase: any,
  userId: string
): Promise<void> {
  try {
    // Busca número do admin
    const { data: adminData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", `admin_notification_phone_${userId}`)
      .maybeSingle();

    if (!adminData?.value) {
      console.log(`[notifyAdminPanelBack] Sem número de admin para userId ${userId}`);
      return;
    }

    const adminPhone =
      typeof adminData.value === "string"
        ? adminData.value
        : adminData.value.phone;

    if (!adminPhone) {
      console.log(`[notifyAdminPanelBack] Número de admin vazio para userId ${userId}`);
      return;
    }

    // Busca credentials Evolution
    const { data: settingsData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", `wa_evolution_user_${userId}`)
      .maybeSingle();

    if (!settingsData?.value) {
      console.log(`[notifyAdminPanelBack] Sem credentials Evolution para userId ${userId}`);
      return;
    }

    const settings =
      typeof settingsData.value === "string"
        ? JSON.parse(settingsData.value)
        : settingsData.value;

    const apiUrl = settings.apiBaseUrl;
    const apiKey = settings.apiKey;
    const instance = settings.instanceName;

    if (!apiUrl || !apiKey || !instance) {
      console.log(`[notifyAdminPanelBack] Credentials incompletas para userId ${userId}`);
      return;
    }

    const adminMessage =
      "✅ RECUPERADO: UniPlay está ONLINE\n\n" +
      "⏰ " + new Date().toLocaleString("pt-BR") + "\n" +
      "📍 Painel respondendo normalmente\n" +
      "✨ Clientes estão sendo notificados do retorno";

    const sent = await sendEvolutionMessage(
      apiUrl,
      apiKey,
      instance,
      adminPhone,
      adminMessage
    );

    if (sent) {
      console.log(
        `[notifyAdminPanelBack] ✅ Notificação de recuperação enviada para admin ${adminPhone}`
      );
    } else {
      console.log(
        `[notifyAdminPanelBack] ❌ Falha ao enviar para admin ${adminPhone}`
      );
    }
  } catch (error) {
    console.error(`[notifyAdminPanelBack] Erro:`, error);
  }
}
  apiBaseUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${apiBaseUrl}/message/sendText/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: phone,
          text: message,
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error(`[sendEvolutionMessage] Erro ao enviar para ${phone}:`, error);
    return false;
  }
}

/**
 * Processa um usuário: verifica estado e envia notificações se necessário.
 */
async function processUserNotifications(
  supabase: any,
  userId: string,
  apiBaseUrl: string,
  apiKey: string,
  instanceName: string,
  isPanelOnline: boolean
): Promise<void> {
  try {
    const stateKey = `panel_down_monitoring_${userId}`;

    // Carrega estado atual
    const { data: stateData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", stateKey)
      .maybeSingle();

    if (!stateData?.value) return;

    const state: PanelMonitoringState =
      typeof stateData.value === "string"
        ? JSON.parse(stateData.value)
        : stateData.value;

    // Se painel estava offline e agora está online
    if (state.isDown && isPanelOnline) {
      console.log(
        `[processUserNotifications] Painel voltou online para userId ${userId}`
      );

      // Clientes que ainda não foram notificados
      const clientsToNotify = state.clientsReporting.filter(
        (r) => !state.notificationsSent?.[r.phone]
      );

      const backOnlineMsg =
        "✅ Ótimas notícias! O serviço voltou ao normal.\n\n" +
        "Agora você já consegue assistir normalmente. " +
        "Se o problema persistir, entre em contato com nossos atendentes! 😊";

      // Envia mensagem para cada cliente
      let sentCount = 0;
      for (const client of clientsToNotify) {
        const sent = await sendEvolutionMessage(
          apiBaseUrl,
          apiKey,
          instanceName,
          client.phone,
          backOnlineMsg
        );

        if (sent) {
          sentCount++;
          state.notificationsSent = state.notificationsSent || {};
          state.notificationsSent[client.phone] = new Date().toISOString();
          console.log(`[processUserNotifications] ✅ Enviado para ${client.phone}`);
        }
      }

      console.log(
        `[processUserNotifications] Notificações enviadas: ${sentCount}/${clientsToNotify.length}`
      );

      // Atualiza estado: marca como online, mantém registro de notificações
      const updated: PanelMonitoringState = {
        isDown: false,
        clientsReporting: [],
        notificationsSent: state.notificationsSent,
        lastCheckAt: new Date().toISOString(),
      };

      await supabase
        .from("platform_settings")
        .upsert(
          {
            key: stateKey,
            value: updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
    }
    // Se painel está online mas estado ainda marca como down
    else if (!state.isDown && isPanelOnline) {
      // Apenas atualiza timestamp
      state.lastCheckAt = new Date().toISOString();
      await supabase
        .from("platform_settings")
        .upsert(
          {
            key: stateKey,
            value: state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
    }
  } catch (error) {
    console.error(`[processUserNotifications] Erro para userId ${userId}:`, error);
  }
}

/**
 * Main: monitora painel e envia notificações.
 */
async function monitorPanelAndNotify(): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
  const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE_NAME");

  if (!supabaseUrl || !supabaseKey) {
    console.error("[monitorPanelAndNotify] Credenciais Supabase faltando");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Faz health check do painel
  console.log("[monitorPanelAndNotify] Verificando saúde do painel...");
  const isPanelOnline = await checkPanelHealth();
  console.log(
    `[monitorPanelAndNotify] Painel ${isPanelOnline ? "ONLINE ✅" : "OFFLINE ❌"}`
  );

  try {
    // Busca todos os estados de monitoramento
    const { data: monitoringStates, error } = await supabase
      .from("platform_settings")
      .select("key, value")
      .like("key", "panel_down_monitoring_%");

    if (error) {
      console.error("[monitorPanelAndNotify] Erro ao buscar estados:", error);
      return;
    }

    // Se painel está offline
    if (!isPanelOnline) {
      console.log("[monitorPanelAndNotify] Painel OFFLINE - notificando admins");

      // Notifica cada admin que painel está down
      for (const state of monitoringStates || []) {
        const userId = state.key.replace("panel_down_monitoring_", "");
        await notifyAdminPanelDown(supabase, userId);
      }

      console.log("[monitorPanelAndNotify] Aguardando próxima verificação");
      return;
    }

    // Painel está online: processa notificações para todos os usuários
    console.log(
      "[monitorPanelAndNotify] Painel online, buscando usuários com monitoramento ativo..."
    );

    console.log(
      `[monitorPanelAndNotify] Encontrados ${monitoringStates?.length || 0} usuários com monitoramento`
    );

    // Processa cada usuário
    for (const state of monitoringStates || []) {
      const userId = state.key.replace("panel_down_monitoring_", "");

      // Notifica admin que painel está de volta
      await notifyAdminPanelBack(supabase, userId);

      // Busca credentials do usuário
      const { data: userSettings } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `wa_evolution_user_${userId}`)
        .maybeSingle();

      if (!userSettings?.value) {
        console.log(`[monitorPanelAndNotify] Sem credentials Evolution para userId ${userId}`);
        continue;
      }

      const settings =
        typeof userSettings.value === "string"
          ? JSON.parse(userSettings.value)
          : userSettings.value;

      const apiUrl = settings.apiBaseUrl || evolutionApiUrl;
      const apiKey = settings.apiKey || evolutionApiKey;
      const instance = settings.instanceName || evolutionInstance;

      if (!apiUrl || !apiKey || !instance) {
        console.log(`[monitorPanelAndNotify] Credentials incompletas para userId ${userId}`);
        continue;
      }

      // Processa notificações para este usuário
      await processUserNotifications(
        supabase,
        userId,
        apiUrl,
        apiKey,
        instance,
        isPanelOnline
      );
    }
  } catch (error) {
    console.error("[monitorPanelAndNotify] Erro geral:", error);
  }
}

// Main execution
console.log("[Edge Function] panel-monitor iniciada às", new Date().toISOString());
const task = monitorPanelAndNotify();

try {
  EdgeRuntime.waitUntil(task);
} catch {
  void task;
}

// Resposta imediata
const response = new Response(
  JSON.stringify({
    ok: true,
    message: "Monitoramento iniciado",
    timestamp: new Date().toISOString(),
  }),
  {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }
);

export default response;
