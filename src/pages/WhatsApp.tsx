import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Phone,
  Power,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatBrDate } from "@/lib/format";
import { useHideBalance } from "@/hooks/useHideBalance";
import { useApp } from "@/context/AppContext";
import { useEvolutionConnection } from "@/hooks/useEvolutionConnection";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sendEvolutionText, normalizeBrPhone } from "@/lib/whatsappCore";
import { cn } from "@/lib/utils";
import { WhatsAppRecovery } from "@/components/WhatsAppRecovery";

export default function WhatsAppPage() {
  const { user } = useApp();
  const { phone: maskPhone } = useHideBalance();
  const { status, runtime, qrBase64, pairingCode, refreshQr, checkStatus, onDisconnect, connectedProfile, busy, ensureBotInbound } = useEvolutionConnection(user);
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [showSent, setShowSent] = useState(false);

  if (!user) return null;

  const sendManual = async () => {
    if (!runtime) {
      toast.error("API do WhatsApp não configurada pelo admin");
      return;
    }
    if (status !== "open") {
      toast.error("Vincule o WhatsApp pelas Conexões antes de enviar");
      return;
    }
    const number = normalizeBrPhone(sendTo);
    if (!number) {
      toast.error("Informe um número válido com DDI (ex: +55 11 99999-9999)");
      return;
    }
    if (!sendMessage.trim()) {
      toast.error("Informe a mensagem");
      return;
    }
    setSending(true);
    try {
      await sendEvolutionText(runtime, number, sendMessage);
      toast.success("Mensagem enviada");
      setSendMessage("");
    } catch (e) {
      toast.error(`Falha ao enviar: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Conexão, envio de mensagens e recuperação de clientes."
      />

      <Tabs defaultValue="conexao" className="space-y-4">
        <TabsList className="h-auto flex-wrap bg-background/80">
          <TabsTrigger value="conexao" className="gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Conexão
          </TabsTrigger>
          <TabsTrigger value="enviar" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Enviar mensagem
          </TabsTrigger>
          <TabsTrigger value="recuperacao" className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            Recuperar clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexao" className="mt-0 space-y-4">
          <section className="ax-surface space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold tracking-tight">Status da conexão</h2>
                <p className="text-sm text-muted-foreground">
                  {status === "open"
                    ? "WhatsApp conectado e pronto para enviar mensagens."
                    : status === "qr"
                      ? "Aguardando leitura do QR Code."
                      : status === "connecting"
                        ? "Conectando…"
                        : status === "error"
                          ? "Erro na conexão."
                          : "WhatsApp desconectado."}
                </p>
                {connectedProfile && (
                  <p className="text-xs text-muted-foreground">
                    Número: {connectedProfile.phone}
                    {connectedProfile.profileName && ` · ${connectedProfile.profileName}`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {status === "qr" || status === "disconnected" || status === "error" ? (
                  <Button
                    type="button"
                    onClick={() => void refreshQr()}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="mr-2 h-4 w-4" />
                    )}
                    {busy ? "Gerando QR…" : "Obter QR Code"}
                  </Button>
                ) : null}
                {status === "open" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void onDisconnect()}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Power className="mr-2 h-4 w-4" />
                    )}
                    Desconectar
                  </Button>
                ) : null}
              </div>
            </div>

            {qrBase64 && (
              <div className="flex items-center justify-center">
                <img src={qrBase64} alt="QR Code WhatsApp" className="max-w-xs w-64 h-64 rounded-lg border p-2 bg-white" />
                {pairingCode && (
                  <p className="mt-2 text-xs text-muted-foreground text-center">
                    Código de pareamento: <span className="font-mono font-semibold">{pairingCode}</span>
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void checkStatus()}
                disabled={busy || status === "open"}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar status
              </Button>
              <Button
                type="button"
                onClick={() => void ensureBotInbound()}
                disabled={busy || status !== "open"}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                Ativar recebimento de mensagens
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="enviar" className="mt-0 space-y-4">
          <section className="ax-surface space-y-4 p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="send-to">Número de destino</Label>
                <Input
                  id="send-to"
                  type="tel"
                  placeholder="+55 11 99999-9999"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Informe o número com DDI (código do país) e DDD.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="send-message">Mensagem</Label>
                <Textarea
                  id="send-message"
                  rows={4}
                  placeholder="Digite sua mensagem aqui…"
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void sendManual()}
                disabled={sending || status !== "open" || !runtime}
                className="w-full"
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {status !== "open" ? "Conecte o WhatsApp primeiro" : "Enviar mensagem"}
              </Button>
              {status !== "open" && (
                <p className="text-xs text-muted-foreground">
                  Vincule o WhatsApp na aba Conexão antes de enviar mensagens.
                </p>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="recuperacao" className="mt-0">
          {user && <WhatsAppRecovery userId={user.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
