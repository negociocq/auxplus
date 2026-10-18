import { useEffect, useState, type FormEvent } from "react";
import { MonitorPlay, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultIptvPlatformConfig,
  loadIptvPlatformConfig,
  saveIptvPlatformConfig,
  type IptvPlatformConfig,
} from "@/lib/platformApi";

export default function AdminAutomations() {
  const [form, setForm] = useState<IptvPlatformConfig>(
    defaultIptvPlatformConfig(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadIptvPlatformConfig()
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.apiBaseUrl.trim()) {
      toast.error("Informe a API base");
      return;
    }
    setSaving(true);
    try {
      const current = await loadIptvPlatformConfig();
      const result = await saveIptvPlatformConfig({
        ...current,
        apiProxyUrl: form.apiProxyUrl,
      });
      if (result.warning) toast.message(result.warning);
      else toast.success("Proxy UniPlay atualizado para todos os clientes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Configuração global do UniPlay (painel IPTV). Os clientes só ligam a conta deles."
      />

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Os dados do UniPlay são fixos e aparecem somente para consulta.
            Altere apenas o <strong className="text-foreground">Proxy API (produção)</strong>{" "}
            quando o endereço do túnel mudar.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void onSave(e)}
        className="ax-surface mx-auto max-w-xl space-y-4 p-5"
      >
        <div className="flex items-center gap-2 font-semibold">
          <MonitorPlay className="h-4 w-4 text-primary" />
          UniPlay / painel IPTV
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-api">API base</Label>
          <Input
            id="iptv-api"
            value={form.apiBaseUrl}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="https://gesapioffice.com/api"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-pkg">Pacote</Label>
          <Input
            id="iptv-pkg"
            value={form.packageId}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-reg">reg_password</Label>
          <Input
            id="iptv-reg"
            type="password"
            value={form.regPassword}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="Só se a listagem exigir"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-url">URL do painel</Label>
          <Input
            id="iptv-url"
            value={form.panelUrl}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="https://searchdefense.top/#/login"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Só para o botão “Abrir painel”.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-proxy">Proxy API (produção)</Label>
          <Input
            id="iptv-proxy"
            value={form.apiProxyUrl || ""}
            disabled={loading}
            onChange={(e) =>
              setForm((f) => ({ ...f, apiProxyUrl: e.target.value }))
            }
            placeholder="https://xxxx.ngrok-free.app"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Só para produção (Vercel) e WhatsApp na nuvem. No{" "}
            <strong>localhost</strong> o app usa o proxy do Vite sozinho — não
            precisa de túnel. Para expor:{" "}
            <code className="rounded bg-muted px-1">npm run ges-proxy</code> +
            cloudflared apontando para a porta 8787; cole a URL nova do túnel
            aqui.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-dns">DNS Smarters</Label>
          <Input
            id="iptv-dns"
            value={form.dnsSmarters || ""}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="http://blushes.top"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-m3u-host">Host M3U</Label>
          <Input
            id="iptv-m3u-host"
            value={form.m3uHost || ""}
            disabled={loading}
            readOnly
            aria-readonly="true"
            className="bg-muted/50 text-muted-foreground"
            placeholder="http://ibetsa.top"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            DNS Smarters e Host M3U são diferentes no UniPlay. Usados ao gerar
            teste se o painel não devolver os links.
          </p>
        </div>

        <Button type="submit" disabled={loading || saving}>
          <Save className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar proxy"}
        </Button>
      </form>
    </div>
  );
}
