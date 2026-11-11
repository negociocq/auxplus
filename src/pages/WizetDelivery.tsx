import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, MessageCircle, Save, Store } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

type WizetConfig = { enabled: boolean; catalogUrl: string; welcome: string; human: string };
const key = (id: string) => `wizet_delivery_${id}`;
const defaults: WizetConfig = { enabled: false, catalogUrl: "", welcome: "Olá! Posso te enviar nosso catálogo?", human: "Se preferir, posso continuar seu atendimento pelo WhatsApp. É só responder atendente." };

export default function WizetDelivery() {
  const { user } = useApp();
  const [cfg, setCfg] = useState<WizetConfig>(defaults);
  useEffect(() => { if (!user) return; try { setCfg({ ...defaults, ...JSON.parse(localStorage.getItem(key(user.id)) || "{}") }); } catch { setCfg(defaults); } }, [user]);
  const save = () => { if (!user) return; localStorage.setItem(key(user.id), JSON.stringify(cfg)); toast.success("Wizet Delivery salvo"); };
  return <div className="space-y-5"><PageHeader title="Wizet Delivery" description="Configure a IA de atendimento da sua loja e o envio do catálogo." /><section className="ax-surface flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Store className="h-5 w-5" /></div><div><h2 className="font-semibold">Atendimento Wizet Delivery</h2><p className="text-sm text-muted-foreground">Responde o cliente com o catálogo e oferece atendimento humano.</p></div></div><div className="flex items-center gap-2"><span className="text-sm">Ativar</span><Switch checked={cfg.enabled} onCheckedChange={enabled => setCfg(p => ({ ...p, enabled }))} /></div></section><section className="ax-surface space-y-4 p-5"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label htmlFor="wizet-catalog">Link do catálogo</Label><Input id="wizet-catalog" type="url" placeholder="https://seusite.com/catalogo" value={cfg.catalogUrl} onChange={e => setCfg(p => ({ ...p, catalogUrl: e.target.value }))} /><p className="text-xs text-muted-foreground">Quando o cliente pedir o cardápio, a IA enviará este link.</p></div><div className="space-y-2"><Label htmlFor="wizet-welcome">Mensagem inicial</Label><Textarea id="wizet-welcome" rows={4} value={cfg.welcome} onChange={e => setCfg(p => ({ ...p, welcome: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="wizet-human">Continuar com atendente</Label><Textarea id="wizet-human" rows={4} value={cfg.human} onChange={e => setCfg(p => ({ ...p, human: e.target.value }))} /></div></div><div className="flex flex-wrap gap-2"><Button onClick={save}><Save className="h-4 w-4" />Salvar configurações</Button><div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><BookOpen className="h-4 w-4" />Catálogo enviado automaticamente</div><div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><MessageCircle className="h-4 w-4" />Atendimento humano disponível</div></div></section>{cfg.enabled && <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Wizet Delivery ativo. O Autoatendimento do IPTV continua independente.</div>}</div>;
}
