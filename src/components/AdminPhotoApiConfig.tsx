import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const endpoint = `${SUPABASE_URL}/functions/v1/admin-photo-config`;
const headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

export function AdminPhotoApiConfig() {
  const { user } = useApp();
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
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
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers,
        body: JSON.stringify({ username: user.username, password, apiKey: apiKey.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a chave.");
      setConfigured(true);
      setLoadError(false);
      setApiKey("");
      toast.success("Chave salva no servidor. O atendimento já pode tentar ler as fotos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a chave.");
    } finally { setPassword(""); setSaving(false); }
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
      <div className="space-y-2">
        <Label htmlFor="openai-admin-password">Sua senha de administrador</Label>
        <Input id="openai-admin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Confirme sua senha do AuxPlus" autoComplete="current-password" disabled={saving || loading} required />
        <p className="text-xs text-muted-foreground">Confirmação necessária para salvar ou trocar esta chave.</p>
      </div>
      <p className="text-xs text-muted-foreground">A API OpenAI precisa ter faturamento ativo e cobra por uso. A assinatura do ChatGPT não inclui esses créditos.</p>
      <Button type="submit" disabled={saving || loading || !apiKey.trim() || !password || !user?.isAdmin}><Save className="h-4 w-4" />{saving ? "Salvando…" : "Salvar chave OpenAI"}</Button>
    </form>
  );
}
