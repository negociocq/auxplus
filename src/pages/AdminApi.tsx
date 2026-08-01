import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultEvolutionPlatformConfig,
  loadEvolutionPlatformConfig,
  saveEvolutionPlatformConfig,
  type EvolutionPlatformConfig,
} from "@/lib/platformApi";

export default function AdminApi() {
  const [form, setForm] = useState<EvolutionPlatformConfig>(
    defaultEvolutionPlatformConfig(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadEvolutionPlatformConfig()
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.apiBaseUrl.trim() || !form.apiKey.trim()) {
      toast.error("Preencha a URL e a chave da Evolution API");
      return;
    }
    setSaving(true);
    try {
      const result = await saveEvolutionPlatformConfig({
        apiBaseUrl: form.apiBaseUrl.trim().replace(/\/$/, ""),
        apiKey: form.apiKey.trim(),
        instancePrefix: form.instancePrefix.trim() || "auxplus",
      });
      if (result.warning) toast.message(result.warning);
      else toast.success("API salva — os clientes já podem vincular o WhatsApp");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="API"
        description="Configure a Evolution API uma vez. Os clientes só escaneiam o QR — sem colar chave."
      />

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Cada usuário ganha uma instância própria (
            <code className="rounded bg-muted px-1">
              {form.instancePrefix || "auxplus"}-usuario…
            </code>
            ). Só o admin gerencia URL e chave.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void onSave(e)}
        className="ax-surface mx-auto max-w-xl space-y-4 p-5"
      >
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Evolution API
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-url">URL da API</Label>
          <Input
            id="api-url"
            value={form.apiBaseUrl}
            disabled={loading}
            onChange={(e) =>
              setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))
            }
            placeholder="http://localhost:8080 ou URL do ngrok"
            required
          />
          <p className="text-xs text-muted-foreground">
            No PC local (Docker), use{" "}
            <code className="rounded bg-muted px-1">http://localhost:8080</code>
            . Em desenvolvimento o app faz proxy automático e evita CORS. Com
            ngrok no navegador, a Evolution precisa liberar CORS.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">Chave (API Key)</Label>
          <Input
            id="api-key"
            type="password"
            value={form.apiKey}
            disabled={loading}
            onChange={(e) =>
              setForm((f) => ({ ...f, apiKey: e.target.value }))
            }
            placeholder="Cole a chave aqui"
            required
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-prefix">Prefixo das instâncias</Label>
          <Input
            id="api-prefix"
            value={form.instancePrefix}
            disabled={loading}
            onChange={(e) =>
              setForm((f) => ({ ...f, instancePrefix: e.target.value }))
            }
            placeholder="auxplus"
          />
          <p className="text-xs text-muted-foreground">
            Usado para nomear a sessão de cada cliente automaticamente.
          </p>
        </div>

        <Button type="submit" disabled={loading || saving}>
          <Save className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar API"}
        </Button>
      </form>
    </div>
  );
}
