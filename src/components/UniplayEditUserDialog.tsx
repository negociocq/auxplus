import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { editIptvUser, ensureIptvToken, fetchIptvEditPackages, findIptvUserByUsername, type IptvPanelCreds, type IptvRemoteUser, type IptvPackage } from "@/lib/iptvPanelApi";

export type EditedUniplayUser = { username: string; phone: string; nota: string };

export function UniplayEditUserDialog({ username, creds, onClose, onToken, onSaved }: {
  username: string; creds: IptvPanelCreds; onClose: () => void;
  onToken: (token: string) => void;
  onSaved: (original: string, updated: EditedUniplayUser) => void;
}) {
  const [remote, setRemote] = useState<IptvRemoteUser | null>(null);
  const [login, setLogin] = useState("");
  const [phone, setPhone] = useState("");
  const [nota, setNota] = useState("");
  const [custom, setCustom] = useState(false);
  const [plan, setPlan] = useState("0");
  const [bouquets, setBouquets] = useState<string[]>([]);
  const [packages, setPackages] = useState<IptvPackage[]>([]);
  const [groups, setGroups] = useState<IptvPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optionsError, setOptionsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ensured = await ensureIptvToken(creds);
        if (cancelled) return;
        onToken(ensured.token);
        const auth = { ...creds, bearerToken: ensured.token };
        const user = await findIptvUserByUsername(auth, username, { exactOnly: true });
        if (cancelled) return;
        if (!user) throw new Error("Usuário não encontrado no painel UniPlay");
        setRemote(user);
        setLogin(user.username || username);
        setPhone(String(user.whatsapp ?? user.phone ?? "").replace(/\D/g, "").replace(/^0$/, ""));
        setNota(String(user.nota ?? ""));
        const options = await Promise.allSettled([fetchIptvEditPackages(auth, true), fetchIptvEditPackages(auth, false)]);
        if (cancelled) return;
        if (options[0].status === "fulfilled") setPackages(options[0].value);
        if (options[1].status === "fulfilled") setGroups(options[1].value);
        setOptionsError(options.some((option) => option.status === "rejected"));
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Falha ao carregar usuário");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // The parent mounts a fresh dialog for every selected user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!remote || !login.trim() || saving) return;
    if (custom && !bouquets.length) { toast.error("Selecione pelo menos um pacote"); return; }
    setSaving(true);
    try {
      const ensured = await ensureIptvToken(creds);
      onToken(ensured.token);
      await editIptvUser({ ...creds, bearerToken: ensured.token }, remote.id, {
        username: login, whatsapp: phone, nota, package: custom ? "0" : plan,
        id_iptv: remote.id_iptv as string | number,
        isCustomPackage: custom, bouquets: custom ? bouquets : [],
      });
      onSaved(username, { username: login.trim(), phone, nota });
      toast.success("Usuário atualizado no UniPlay");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao editar usuário"); }
    finally { setSaving(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader><DialogTitle>Editar usuário UniPlay</DialogTitle></DialogHeader>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={saving || !remote} className="space-y-4">
            <div className="space-y-1"><Label htmlFor="edit-iptv-login">Usuário</Label><Input id="edit-iptv-login" required value={login} onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" /></div>
            <div className="space-y-1"><Label htmlFor="edit-iptv-phone">WhatsApp com DDI</Label><Input id="edit-iptv-phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="tel" placeholder="5511911111111" /><p className="text-xs text-muted-foreground">Somente números, incluindo o código do país.</p></div>
            <Label className="flex items-center justify-between">Pacote Pronto<Switch checked={custom} disabled={!groups.length} onCheckedChange={(value) => { setCustom(value); setPlan("0"); setBouquets([]); }} /></Label>
            {custom ? <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3" role="group" aria-label="Pacotes disponíveis">
              {groups.map((group) => <label key={group.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bouquets.includes(String(group.id))} onChange={(e) => setBouquets((prev) => e.target.checked ? [...prev, String(group.id)] : prev.filter((id) => id !== String(group.id)))} />{group.name || group.id}</label>)}
            </div> : <Select value={plan} onValueChange={setPlan} disabled={saving || !remote}><SelectTrigger aria-label="Plano"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Mantém plano atual</SelectItem>{packages.filter((p) => String(p.id) !== "0").map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name || String(p.id)}</SelectItem>)}</SelectContent></Select>}
            {optionsError ? <p className="text-xs text-muted-foreground">Alguns pacotes não puderam ser carregados. Você pode editar os dados mantendo o plano atual.</p> : null}
            <div className="space-y-1"><Label htmlFor="edit-iptv-nota">Anotações</Label><Textarea id="edit-iptv-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Digite aqui as anotações" /></div>
          </fieldset>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving || !remote || !login.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar alterações</Button></DialogFooter>
        </form>}
    </DialogContent>
  </Dialog>;
}
