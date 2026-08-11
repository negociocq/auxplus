import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Trash2, RefreshCw, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface MpOrder {
  id: string;
  mpPaymentId: string;
  panelUsername: string;
  clientName: string;
  phone: string;
  amount: number;
  error?: string | null;
  status: string;
  releasedAt?: string | null;
  createdAt: string;
  blocked?: boolean;
}

interface MpOrdersData {
  orders: MpOrder[];
}

export function MpOrdersCleanup({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [problematicOrders, setProblematicOrders] = useState<MpOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        setProblematicOrders([]);
        setLoaded(true);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as MpOrdersData);

      const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
      const problematic = orders.filter(
        (o) => !o.blocked && (o.error || (o.status === "approved" && !o.releasedAt))
      );

      setProblematicOrders(problematic);
      setLoaded(true);
    } catch (e) {
      console.error("[MpOrdersCleanup] Erro ao carregar:", e);
      toast.error("Erro ao carregar pedidos");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadOrders();
  }, [userId]);

  const blockOrder = async (orderId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        setLoading(false);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as MpOrdersData);

      const orders = Array.isArray(parsed.orders)
        ? parsed.orders.map((o) =>
            o.id === orderId
              ? { ...o, blocked: true, blockedAt: new Date().toISOString() }
              : o
          )
        : [];

      await supabase
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", `mp_orders_user_${userId}`);

      setProblematicOrders(problematicOrders.filter((o) => o.id !== orderId));
      toast.success("Pedido bloqueado permanentemente");
    } catch (e) {
      console.error("[MpOrdersCleanup] Erro ao bloquear:", e);
      toast.error("Erro ao bloquear pedido");
    } finally {
      setLoading(false);
    }
  };

  const removeOrder = async (orderId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        setLoading(false);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as MpOrdersData);

      const orders = Array.isArray(parsed.orders)
        ? parsed.orders.filter((o) => o.id !== orderId)
        : [];

      await supabase
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", `mp_orders_user_${userId}`);

      setProblematicOrders(problematicOrders.filter((o) => o.id !== orderId));
      toast.success("Pedido removido");
    } catch (e) {
      console.error("[MpOrdersCleanup] Erro ao remover:", e);
      toast.error("Erro ao remover pedido");
    } finally {
      setLoading(false);
    }
  };

  const blockAllByError = async (errorPattern: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        setLoading(false);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as MpOrdersData);

      const orders = Array.isArray(parsed.orders)
        ? parsed.orders.map((o) =>
            o.error && o.error.toLowerCase().includes(errorPattern.toLowerCase())
              ? { ...o, blocked: true, blockedAt: new Date().toISOString() }
              : o
          )
        : [];

      await supabase
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", `mp_orders_user_${userId}`);

      const blocked = problematicOrders.filter(
        (o) => o.error && o.error.toLowerCase().includes(errorPattern.toLowerCase())
      ).length;

      setProblematicOrders(
        problematicOrders.filter(
          (o) =>
            !o.error ||
            !o.error.toLowerCase().includes(errorPattern.toLowerCase())
        )
      );

      toast.success(`${blocked} pedido(s) bloqueado(s) permanentemente`);
    } catch (e) {
      console.error("[MpOrdersCleanup] Erro:", e);
      toast.error("Erro ao bloquear pedidos");
    } finally {
      setLoading(false);
    }
  };

  const removeAllByError = async (errorPattern: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        setLoading(false);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as MpOrdersData);

      const orders = Array.isArray(parsed.orders)
        ? parsed.orders.filter(
            (o) =>
              !o.error ||
              !o.error.toLowerCase().includes(errorPattern.toLowerCase())
          )
        : [];

      await supabase
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", `mp_orders_user_${userId}`);

      const removed = problematicOrders.filter(
        (o) => o.error && o.error.toLowerCase().includes(errorPattern.toLowerCase())
      ).length;

      setProblematicOrders(
        problematicOrders.filter(
          (o) =>
            !o.error ||
            !o.error.toLowerCase().includes(errorPattern.toLowerCase())
        )
      );

      toast.success(`${removed} pedido(s) removido(s)`);
    } catch (e) {
      console.error("[MpOrdersCleanup] Erro:", e);
      toast.error("Erro ao remover pedidos");
    } finally {
      setLoading(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (problematicOrders.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3">
        <p className="text-sm text-foreground">✓ Nenhum pedido travado</p>
        <p className="text-xs text-muted-foreground">
          Todos os pedidos estão OK
        </p>
      </div>
    );
  }

  const byErrorPattern = problematicOrders.reduce(
    (acc, order) => {
      const key = order.error?.includes("não encontrado")
        ? "não encontrado"
        : order.error || "pago-não-liberado";
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    },
    {} as Record<string, MpOrder[]>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {problematicOrders.length} pedido(s) com problema
          </p>
          <p className="text-xs text-amber-800/70 dark:text-amber-300/70">
            Clique ⚠️ para bloquear permanentemente ou 🗑️ para remover
          </p>
        </div>
      </div>

      {Object.entries(byErrorPattern).map(([pattern, orders]) => (
        <div key={pattern} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className={cn(
                pattern === "não encontrado" && "border-red-300 bg-red-50"
              )}
            >
              {pattern === "não encontrado" ? "Usuário não encontrado" : pattern}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {orders.length} pedido(s)
            </span>
          </div>

          <div className="space-y-1.5">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {order.clientName || order.panelUsername}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Usuário: {order.panelUsername} · R${" "}
                    {order.amount?.toFixed(2) || "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeOrder(order.id)}
                    disabled={loading}
                    className="h-7 w-full"
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    🚫 BLOQUEAR PERMANENTEMENTE
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              pattern === "não encontrado"
                ? blockAllByError(pattern)
                : removeAllByError(pattern)
            }
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : pattern === "não encontrado" ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {pattern === "não encontrado" ? "Bloquear todos (1)" : `Remover todos (${orders.length})`}
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        variant="outline"
        onClick={() => void loadOrders()}
        disabled={loading}
        className="w-full"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Recarregar
      </Button>
    </div>
  );
}
