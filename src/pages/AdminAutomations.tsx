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
      const result = await saveIptvPlatformConfig(form);
      if (result.warning) toast.message(result.warning);
      else toast.success("UniPlay configurado para todos os clientes");
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
            API, pacote, reg_password e URL do painel ficam aqui. No app do
            cliente aparece só como <strong className="text-foreground">UniPlay</strong>{" "}
            — login da conta + renovar/teste/ativar app.
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
            onChange={(e) =>
              setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))
            }
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
            onChange={(e) =>
              setForm((f) => ({ ...f, packageId: e.target.value }))
            }
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
            onChange={(e) =>
              setForm((f) => ({ ...f, regPassword: e.target.value }))
            }
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
            onChange={(e) =>
              setForm((f) => ({ ...f, panelUrl: e.target.value }))
            }
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
            A UniPlay bloqueia login pela nuvem (erro Upstream 404). No PC onde
            o localhost já conecta, rode{" "}
            <code className="rounded bg-muted px-1">
              node scripts/ges-proxy-server.mjs
            </code>{" "}
            e exponha com ngrok; cole a URL aqui. Deixe vazio só em localhost.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="iptv-dns">DNS Smarters</Label>
          <Input
            id="iptv-dns"
            value={form.dnsSmarters || ""}
            disabled={loading}
            onChange={(e) =>
              setForm((f) => ({ ...f, dnsSmarters: e.target.value }))
            }
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
            onChange={(e) =>
              setForm((f) => ({ ...f, m3uHost: e.target.value }))
            }
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
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
