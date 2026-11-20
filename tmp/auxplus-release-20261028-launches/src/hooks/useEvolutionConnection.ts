import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  fetchEvolutionConnectedProfile,
  fetchEvolutionQr,
  fetchEvolutionStatus,
  findEvolutionWebhook,
  logoutEvolution,
  setEvolutionWebhook,
  type EvolutionConnectedProfile,
  type EvolutionRuntimeConfig,
  type WaConnectionStatus,
} from "@/lib/whatsappAutomation";
import {
  instanceNameForUser,
  isEvolutionConfigured,
  loadEvolutionPlatformConfig,
  type EvolutionPlatformConfig,
} from "@/lib/platformApi";
import { registerWaInstanceMapping } from "@/lib/whatsappBotConfig";
import { SUPABASE_URL } from "@/integrations/supabase/client";
import type { User } from "@/types";

export type UseEvolutionConnectionResult = {
  platform: EvolutionPlatformConfig | null;
  /** null quando o admin ainda não configurou a Evolution (isEvolutionConfigured). */
  runtime: EvolutionRuntimeConfig | null;
  status: WaConnectionStatus;
  qrBase64: string | null;
  pairingCode: string | null;
  busy: boolean;
  connectedProfile: EvolutionConnectedProfile | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  ensureBotInbound: (opts?: { silent?: boolean }) => Promise<boolean>;
  refreshQr: () => Promise<void>;
  checkStatus: () => Promise<void>;
  onDisconnect: () => Promise<void>;
};

/**
 * Estado da conexão WhatsApp (Evolution): platform/runtime/status, QR, perfil
 * conectado, poll de 4s enquanto escaneando, webhook do bot, desconexão.
 *
 * Usado pela página WhatsApp (só para liberar a fila) e pela página Conexões
 * (UI de QR/status). Cada uma monta sua própria instância em rotas distintas,
 * então o poll nunca roda em duplicidade.
 */
export function useEvolutionConnection(
  user: User | null,
): UseEvolutionConnectionResult {
  const [platform, setPlatform] = useState<EvolutionPlatformConfig | null>(
    null,
  );
  const [status, setStatus] = useState<WaConnectionStatus>("disconnected");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectedProfile, setConnectedProfile] =
    useState<EvolutionConnectedProfile | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    void loadEvolutionPlatformConfig().then(setPlatform);
  }, []);

  const runtime: EvolutionRuntimeConfig | null = useMemo(() => {
    if (!user || !platform || !isEvolutionConfigured(platform)) return null;
    return {
      apiBaseUrl: platform.apiBaseUrl,
      apiKey: platform.apiKey,
      instanceName: instanceNameForUser(
        platform.instancePrefix,
        user.id,
        user.username,
      ),
    };
  }, [platform, user]);

  const stopPoll = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const ensureBotInbound = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!runtime || !user) return false;
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      try {
        await registerWaInstanceMapping(runtime.instanceName, user.id);
        await setEvolutionWebhook(runtime, webhookUrl);
        const found = await findEvolutionWebhook(runtime);
        const okUrl =
          !found?.url ||
          found.url.includes("evolution-webhook") ||
          found.url.includes(webhookUrl);
        if (!opts?.silent) {
          if (okUrl) {
            toast.success("Recebimento do bot ativo", {
              description:
                "Mande mensagem do celular do revendedor/cliente para este WhatsApp.",
            });
          } else {
            toast.message("Webhook registrado, confira a Evolution", {
              description: found?.url || webhookUrl,
            });
          }
        }
        return true;
      } catch (e) {
        console.warn("[whatsapp] webhook/bot inbound", e);
        if (!opts?.silent) {
          toast.error("Não deu para ativar o recebimento do bot", {
            description:
              e instanceof Error
                ? e.message
                : "A Evolution (ngrok/Docker) precisa estar no ar.",
          });
        }
        return false;
      }
    },
    [runtime, user],
  );

  const loadConnectedProfile = useCallback(async () => {
    if (!runtime) {
      setConnectedProfile(null);
      return;
    }
    try {
      const profile = await fetchEvolutionConnectedProfile(runtime);
      setConnectedProfile(profile);
    } catch {
      setConnectedProfile(null);
    }
  }, [runtime]);

  const refreshQr = useCallback(async () => {
    if (!runtime) {
      setStatus("disconnected");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.error(
        "WhatsApp ainda não foi liberado. Peça ao administrador para configurar em Admin → API.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetchEvolutionQr(runtime);
      setStatus(res.status);
      setQrBase64(res.base64 || null);
      setPairingCode(res.pairingCode || null);
      if (res.status === "open") {
        toast.success("WhatsApp vinculado");
        stopPoll();
        void loadConnectedProfile();
        void ensureBotInbound({ silent: true });
      } else {
        setConnectedProfile(null);
      }
    } catch (e) {
      setStatus("error");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.error(e instanceof Error ? e.message : "Falha ao obter QR Code");
    } finally {
      setBusy(false);
    }
  }, [runtime, loadConnectedProfile, ensureBotInbound]);

  const checkStatus = useCallback(async () => {
    if (!runtime) return;
    try {
      const st = await fetchEvolutionStatus(runtime);
      setStatus(st);
      if (st === "open") {
        setQrBase64(null);
        stopPoll();
        void loadConnectedProfile();
        void ensureBotInbound({ silent: true });
      } else {
        setConnectedProfile(null);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [runtime, loadConnectedProfile, ensureBotInbound]);

  useEffect(() => {
    if (status !== "qr" && status !== "connecting") {
      stopPoll();
      return;
    }
    stopPoll();
    pollRef.current = window.setInterval(() => {
      void checkStatus();
    }, 4000);
    return stopPoll;
  }, [status, checkStatus]);

  useEffect(() => {
    if (!runtime) return;
    // Silencia erros de polagem de status na inicialização
    checkStatus().catch(() => {
      /* erros esperados durante tentativas de conexão */
    });
  }, [runtime, checkStatus]);

  const onDisconnect = async () => {
    if (!runtime) return;
    setBusy(true);
    try {
      await logoutEvolution(runtime);
      setStatus("disconnected");
      setQrBase64(null);
      setConnectedProfile(null);
      toast.message("WhatsApp desvinculado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setBusy(false);
    }
  };

  return {
    platform,
    runtime,
    status,
    qrBase64,
    pairingCode,
    busy,
    connectedProfile,
    setBusy,
    ensureBotInbound,
    refreshQr,
    checkStatus,
    onDisconnect,
  };
}
