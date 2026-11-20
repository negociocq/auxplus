import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface CancelPixVerificationProps {
  userId: string;
  mpPaymentId: string;
  panelUsername: string;
  clientName: string;
  amount: number;
  onCancelled?: () => void;
}

export function CancelPixVerification({
  userId,
  mpPaymentId,
  panelUsername,
  clientName,
  amount,
  onCancelled,
}: CancelPixVerificationProps) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      // Pega os pedidos atuais
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", `mp_orders_user_${userId}`)
        .maybeSingle();

      if (!data?.value) {
        toast.error("Pedido não encontrado");
        setCancelling(false);
        return;
      }

      const parsed =
        typeof data.value === "string"
          ? JSON.parse(data.value)
          : data.value;

      const orders = Array.isArray(parsed.orders) ? parsed.orders : [];

      // Remove o pedido específico
      const updated = orders.filter((o) => o.mpPaymentId !== mpPaymentId);

      // Salva de volta
      await supabase
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders: updated }) })
        .eq("key", `mp_orders_user_${userId}`);

      toast.success("✅ Verificação cancelada permanentemente");
      toast.message("Nenhuma notificação ou mensagem será enviada");

      // Callback para remover da UI
      onCancelled?.();
    } catch (e) {
      console.error("[CancelPixVerification] Erro:", e);
      toast.error(
        e instanceof Error ? e.message : "Erro ao cancelar verificação"
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={() => void handleCancel()}
      disabled={cancelling}
      className="gap-1.5"
      title="Cancelar verificação desse PIX permanentemente"
    >
      {cancelling ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      Cancelar verificação
    </Button>
  );
}
