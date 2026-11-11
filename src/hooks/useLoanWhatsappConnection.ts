import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { loadEvolutionPlatformConfig, isEvolutionConfigured, type EvolutionPlatformConfig } from "@/lib/platformApi";
import { fetchEvolutionConnectedProfile, fetchEvolutionQr, fetchEvolutionStatus, logoutEvolution, type EvolutionConnectedProfile, type EvolutionRuntimeConfig, type WaConnectionStatus } from "@/lib/whatsappAutomation";
import { loanInstanceName } from "../../supabase/functions/_shared/waLoanConnection";

/** Loan-only connection: never registers the IPTV bot mapping or webhook. */
export function useLoanWhatsappConnection(userId: string | undefined, folderId: string) {
  const [platform, setPlatform] = useState<EvolutionPlatformConfig | null>(null);
  const [status, setStatus] = useState<WaConnectionStatus>("disconnected");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectedProfile, setConnectedProfile] = useState<EvolutionConnectedProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let mounted = true; void loadEvolutionPlatformConfig().then(value => { if (mounted) setPlatform(value); }); return () => { mounted = false; }; }, []);
  const runtime: EvolutionRuntimeConfig | null = useMemo(() => userId && platform && isEvolutionConfigured(platform) ? { apiBaseUrl: platform.apiBaseUrl, apiKey: platform.apiKey, instanceName: loanInstanceName(platform.instancePrefix, userId, folderId) } : null, [platform, userId, folderId]);
  const active = useRef<string | null>(null);
  active.current = runtime?.instanceName || null;
  const checkStatus = useCallback(async () => {
    if (!runtime) return;
    const current = await fetchEvolutionStatus(runtime);
    if (active.current !== runtime.instanceName) return;
    setStatus(current);
    if (current === "open") {
      setQrBase64(null); setPairingCode(null);
      const profile = await fetchEvolutionConnectedProfile(runtime).catch(() => null);
      if (active.current === runtime.instanceName) setConnectedProfile(profile);
    } else setConnectedProfile(null);
  }, [runtime]);
  useEffect(() => {
    const name = runtime?.instanceName || null;
    active.current = name;
    setStatus("disconnected"); setQrBase64(null); setPairingCode(null); setConnectedProfile(null); setBusy(false);
    void checkStatus().catch(() => {});
    return () => { if (active.current === name) active.current = null; };
  }, [checkStatus]);
  useEffect(() => {
    if (status !== "qr" && status !== "connecting") return;
    const timer = window.setInterval(() => { void checkStatus().catch(() => {}); }, 4000);
    return () => window.clearInterval(timer);
  }, [status, checkStatus]);
  const refreshQr = async (phoneNumber?: string) => {
    if (!runtime) { toast.error("A API do WhatsApp precisa estar configurada pelo administrador."); return; }
    setBusy(true);
    try {
      const normalizedPhone = String(phoneNumber || "").replace(/\D/g, "");
      if (phoneNumber && (normalizedPhone.length < 10 || normalizedPhone.length > 15)) throw new Error("Informe o número com DDI, somente números.");
      const qr = await fetchEvolutionQr(runtime, normalizedPhone || undefined);
      if (active.current !== runtime.instanceName) return;
      setStatus(qr.status); setQrBase64(qr.base64 || null); setPairingCode(qr.pairingCode || null);
      if (qr.status === "open") await checkStatus();
    } catch (error) { if (active.current === runtime.instanceName) toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR desta pasta."); }
    finally { if (active.current === runtime.instanceName) setBusy(false); }
  };
  const disconnect = async () => {
    if (!runtime) return;
    setBusy(true);
    try {
      await logoutEvolution(runtime);
      if (active.current !== runtime.instanceName) return;
      setStatus("disconnected"); setConnectedProfile(null); setQrBase64(null); setPairingCode(null);
      toast.success("WhatsApp desta pasta desconectado");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível desconectar."); }
    finally { if (active.current === runtime.instanceName) setBusy(false); }
  };
  return { runtime, status, connectedProfile, qrBase64, pairingCode, busy, refreshQr, checkStatus, disconnect };
}
