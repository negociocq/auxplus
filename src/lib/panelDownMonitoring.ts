/**
 * Gerenciador de monitoramento do painel e notificação de clientes.
 *
 * Quando painel fica offline:
 * 1. Armazena clientes que reportaram problema
 * 2. Inicia monitoramento contínuo
 * 3. Quando volta: envia WhatsApp automático para todos
 */

import { supabase } from "@/integrations/supabase/client";

export interface PanelDownReport {
  phone: string;
  name?: string;
  reportedAt: string;
  userId: string;
  problemType?: 'assist' | 'payment' | 'other'; // 'assist' = não consigo assistir
}

export interface PanelMonitoringState {
  isDown: boolean;
  wentDownAt?: string;
  clientsReporting: PanelDownReport[];
  notificationsSent?: Record<string, string>; // phone -> sentAt
  lastCheckAt?: string;
}

const STATE_KEY = (userId: string) => `panel_down_monitoring_${userId}`;

/**
 * Registra cliente que reportou problema quando painel está offline.
 * Apenas registra se o problema é de "não consigo assistir"
 */
export async function reportPanelProblem(
  userId: string,
  phone: string,
  clientName?: string,
  problemType?: 'assist' | 'payment' | 'other'
): Promise<void> {
  if (!supabase || !userId) return;

  try {
    // Apenas registra se é problema de assistência
    if (problemType && problemType !== 'assist') {
      console.log(
        `[reportPanelProblem] Ignorando problema tipo "${problemType}" (não é assistência)`
      );
      return;
    }

    const state = await getPanelMonitoringState(userId);

    const newReport: PanelDownReport = {
      phone,
      name: clientName,
      reportedAt: new Date().toISOString(),
      userId,
      problemType: problemType || 'assist',
    };

    // Evita duplicatas do mesmo telefone
    const filtered = state.clientsReporting.filter((r) => r.phone !== phone);

    const updated: PanelMonitoringState = {
      ...state,
      isDown: true,
      wentDownAt: state.wentDownAt || new Date().toISOString(),
      clientsReporting: [...filtered, newReport],
    };

    await savePanelMonitoringState(userId, updated);
  } catch (error) {
    console.error("[reportPanelProblem] Erro:", error);
  }
}

/**
 * Obtém estado atual do monitoramento.
 */
export async function getPanelMonitoringState(
  userId: string
): Promise<PanelMonitoringState> {
  if (!supabase || !userId) {
    return {
      isDown: false,
      clientsReporting: [],
      notificationsSent: {},
    };
  }

  try {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", STATE_KEY(userId))
      .maybeSingle();

    if (!data?.value) {
      return {
        isDown: false,
        clientsReporting: [],
        notificationsSent: {},
      };
    }

    const parsed =
      typeof data.value === "string" ? JSON.parse(data.value) : data.value;

    return (parsed as PanelMonitoringState) || {
      isDown: false,
      clientsReporting: [],
      notificationsSent: {},
    };
  } catch {
    return {
      isDown: false,
      clientsReporting: [],
      notificationsSent: {},
    };
  }
}

/**
 * Salva estado do monitoramento.
 */
export async function savePanelMonitoringState(
  userId: string,
  state: PanelMonitoringState
): Promise<void> {
  if (!supabase || !userId) return;

  try {
    await supabase.from("platform_settings").upsert(
      {
        key: STATE_KEY(userId),
        value: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  } catch (error) {
    console.error("[savePanelMonitoringState] Erro:", error);
  }
}

/**
 * Marca painel como voltou online e prepara notificações.
 */
export async function markPanelBackOnline(userId: string): Promise<string[]> {
  if (!supabase || !userId) return [];

  try {
    const state = await getPanelMonitoringState(userId);

    if (!state.isDown || state.clientsReporting.length === 0) {
      return [];
    }

    // Clientes que ainda não foram notificados
    const phonesToNotify = state.clientsReporting
      .filter((r) => !state.notificationsSent?.[r.phone])
      .map((r) => r.phone);

    if (phonesToNotify.length === 0) {
      // Todos já foram notificados, reseta o estado
      const updated: PanelMonitoringState = {
        isDown: false,
        clientsReporting: [],
        notificationsSent: {},
      };
      await savePanelMonitoringState(userId, updated);
      return [];
    }

    return phonesToNotify;
  } catch (error) {
    console.error("[markPanelBackOnline] Erro:", error);
    return [];
  }
}

/**
 * Marca cliente como já notificado.
 */
export async function markClientNotified(
  userId: string,
  phone: string
): Promise<void> {
  if (!supabase || !userId) return;

  try {
    const state = await getPanelMonitoringState(userId);

    const updated: PanelMonitoringState = {
      ...state,
      notificationsSent: {
        ...(state.notificationsSent || {}),
        [phone]: new Date().toISOString(),
      },
    };

    await savePanelMonitoringState(userId, updated);
  } catch (error) {
    console.error("[markClientNotified] Erro:", error);
  }
}

/**
 * Reseta o estado de monitoramento (após notificar todos).
 */
export async function resetPanelMonitoring(userId: string): Promise<void> {
  if (!supabase || !userId) return;

  try {
    const updated: PanelMonitoringState = {
      isDown: false,
      clientsReporting: [],
      notificationsSent: {},
    };

    await savePanelMonitoringState(userId, updated);
  } catch (error) {
    console.error("[resetPanelMonitoring] Erro:", error);
  }
}

/**
 * Retorna mensagem de reparo em andamento.
 */
export function getRepairInProgressMessage(): string {
  return (
    "❌ Estamos com uma instabilidade no serviço no momento.\n\n" +
    "Nossos técnicos já estão trabalhando no reparo.\n\n" +
    "Quando conseguirmos resolver, enviaremos uma mensagem aqui. 🛠️"
  );
}

/**
 * Retorna mensagem de volta ao normal.
 */
export function getPanelBackOnlineMessage(): string {
  return (
    "✅ Ótimas notícias! O serviço voltou ao normal.\n\n" +
    "Agora você já consegue assistir normalmente. " +
    "Se o problema persistir, entre em contato com nossos atendentes! 😊"
  );
}

/**
 * Marca que painel ficou offline e notifica admin.
 */
export async function markPanelAsDown(userId: string): Promise<void> {
  if (!supabase || !userId) return;

  try {
    const state = await getPanelMonitoringState(userId);

    // Se já está marcado como down, não marca novamente
    if (state.isDown) {
      return;
    }

    const updated: PanelMonitoringState = {
      ...state,
      isDown: true,
      wentDownAt: new Date().toISOString(),
    };

    await savePanelMonitoringState(userId, updated);
    console.log(`[markPanelAsDown] Painel marcado como DOWN para userId ${userId}`);
  } catch (error) {
    console.error("[markPanelAsDown] Erro:", error);
  }
}

/**
 * Obtém mensagem de notificação para admin.
 */
export function getPanelDownAdminMessage(): string {
  return (
    "🚨 ALERTA: UniPlay está OFFLINE\n\n" +
    "⏰ Horário: " + new Date().toLocaleString('pt-BR') + "\n" +
    "📍 Status: Não conseguindo se comunicar com painel\n" +
    "⚠️ Ação: Verifique e repare o servidor\n\n" +
    "Clientes já foram notificados sobre a instabilidade."
  );
}

/**
 * Obtém mensagem de notificação quando painel volta para admin.
 */
export function getPanelBackOnlineAdminMessage(): string {
  return (
    "✅ RECUPERADO: UniPlay está ONLINE\n\n" +
    "⏰ Horário: " + new Date().toLocaleString('pt-BR') + "\n" +
    "📍 Status: Painel respondendo normalmente\n" +
    "✨ Clientes estão sendo notificados"
  );
}
