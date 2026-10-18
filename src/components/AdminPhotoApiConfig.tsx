import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminSessionToken } from "@/lib/adminSession";

const endpoint = `${SUPABASE_URL}/functions/v1/admin-photo-config`;
const headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

export function AdminPhotoApiConfig() {
  const { user, logout } = useApp();
  const [apiKey, setApiKey] = useState("");
  const sessionReady = Boolean(user && getAdminSessionToken(user.id));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { headers, cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setConfigured(result.configured === true);
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.isAdmin) return;
    const token = getAdminSessionToken(user.id);
    if (!token) { toast.error("Entre novamente na conta para atualizar sua sessão."); return; }
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { ...headers, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey: apiKey.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a chave.");
      setConfigured(true);
      setLoadError(false);
      setApiKey("");
      toast.success("Chave salva no servidor. O atendimento já pode tentar ler as fotos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a chave.");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={event => void save(event)} className="ax-surface mx-auto max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" />OpenAI — leitura de fotos</div>
      <p className="text-sm text-muted-foreground">Permite ler MAC, Device Key e Device ID nas fotos enviadas ao atendimento. O cliente confirma os dados antes da ativação.</p>
      <p className="text-sm" role="status">{loading ? "Consultando configuração…" : loadError ? "Não foi possível consultar a configuração. Tente salvar novamente." : configured ? "Chave configurada no servidor." : "Chave ainda não configurada."}</p>
      <div className="space-y-2">
        <Label htmlFor="openai-photo-key">Chave da API OpenAI</Label>
        <Input id="openai-photo-key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={configured ? "Cole uma nova chave para substituir a atual" : "sk-…"} autoComplete="off" spellCheck={false} disabled={saving || loading} required />
        <p className="text-xs text-muted-foreground">A chave fica salva somente no servidor e não aparece novamente neste campo.</p>
      </div>
      {!sessionReady && <div className="space-y-2 text-sm"><p>Entre novamente na conta uma vez para atualizar sua sessão. Depois, basta salvar a chave.</p><Button type="button" variant="outline" onClick={logout}>Entrar novamente</Button></div>}
      <p className="text-xs text-muted-foreground">A API OpenAI precisa ter faturamento ativo e cobra por uso. A assinatura do ChatGPT não inclui esses créditos.</p>
      <Button type="submit" disabled={saving || loading || !apiKey.trim() || !sessionReady || !user?.isAdmin}><Save className="h-4 w-4" />{saving ? "Salvando…" : "Salvar chave OpenAI"}</Button>
    </form>
  );
}
