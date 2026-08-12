/**
 * Gerenciador de pedidos PIX (Mercado Pago)
 * Permite limpar, visualizar e remover pedidos com erro
 */

import { createClient } from "@/integrations/supabase/client";

export interface MpOrder {
  id: string;
  mpPaymentId: string;
  status: "pending" | "approved" | "cancelled" | "rejected" | "expired";
  panelUsername: string;
  clientName: string;
  phone: string;
  amount: number;
  months: number;
  credits?: number;
  kind?: string;
  dueDate?: string;
  itemRefId?: string;
  error?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MpOrdersData {
  orders: MpOrder[];
}

/**
 * Busca todos os pedidos PIX do usuário
 */
export async function fetchUserMpOrders(userId: string): Promise<MpOrder[]> {
  const client = createClient();
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", `mp_orders_user_${userId}`)
    .maybeSingle();

  if (!data?.value) return [];

  try {
    const parsed =
      typeof data.value === "string"
        ? JSON.parse(data.value)
        : (data.value as MpOrdersData);
    return Array.isArray(parsed.orders) ? parsed.orders : [];
  } catch {
    return [];
  }
}

/**
 * Remove um pedido específico da fila
 */
export async function removeOrderFromQueue(
  userId: string,
  orderId: string
): Promise<boolean> {
  const client = createClient();

  try {
    const { data } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", `mp_orders_user_${userId}`)
      .maybeSingle();

    if (!data?.value) return false;

    const parsed =
      typeof data.value === "string"
        ? JSON.parse(data.value)
        : (data.value as MpOrdersData);

    const orders = Array.isArray(parsed.orders)
      ? parsed.orders.filter((o) => o.id !== orderId)
      : [];

    await client
      .from("platform_settings")
      .update({ value: JSON.stringify({ orders }) })
      .eq("key", `mp_orders_user_${userId}`);

    return true;
  } catch (e) {
    console.error("[mpOrdersManager] Erro ao remover pedido:", e);
    return false;
  }
}

/**
 * Remove todos os pedidos com erro específico
 */
export async function removeOrdersByError(
  userId: string,
  errorPattern: string
): Promise<number> {
  const client = createClient();

  try {
    const { data } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", `mp_orders_user_${userId}`)
      .maybeSingle();

    if (!data?.value) return 0;

    const parsed =
      typeof data.value === "string"
        ? JSON.parse(data.value)
        : (data.value as MpOrdersData);

    const before = Array.isArray(parsed.orders) ? parsed.orders.length : 0;
    const orders = Array.isArray(parsed.orders)
      ? parsed.orders.filter(
          (o) =>
            !o.error ||
            !o.error.toLowerCase().includes(errorPattern.toLowerCase())
        )
      : [];
    const removed = before - orders.length;

    if (removed > 0) {
      await client
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", `mp_orders_user_${userId}`);
    }

    return removed;
  } catch (e) {
    console.error("[mpOrdersManager] Erro ao remover pedidos:", e);
    return 0;
  }
}

/**
 * Filtra pedidos com problemas (status "approved" mas não liberado, ou com erro)
 */
export function filterProblematicOrders(orders: MpOrder[]): MpOrder[] {
  return orders.filter((o) => {
    // Pedidos pagos mas não liberados
    if (o.status === "approved" && !o.releasedAt) return true;
    // Pedidos com erro
    if (o.error) return true;
    return false;
  });
}

/**
 * Agrupa pedidos por status/erro para exibição
 */
export function groupOrdersByStatus(
  orders: MpOrder[]
): Record<string, MpOrder[]> {
  const grouped: Record<string, MpOrder[]> = {
    "Pago mas não liberado": [],
    "Erro - Usuário não encontrado": [],
    "Erro - Outro": [],
    Pendente: [],
    Outros: [],
  };

  for (const order of orders) {
    if (order.status === "approved" && !order.releasedAt) {
      if (order.error?.includes("não encontrado")) {
        grouped["Erro - Usuário não encontrado"].push(order);
      } else if (order.error) {
        grouped["Erro - Outro"].push(order);
      } else {
        grouped["Pago mas não liberado"].push(order);
      }
    } else if (order.status === "pending") {
      grouped["Pendente"].push(order);
    } else {
      grouped["Outros"].push(order);
    }
  }

  // Remove grupos vazios
  return Object.fromEntries(
    Object.entries(grouped).filter(([_, orders]) => orders.length > 0)
  );
}
