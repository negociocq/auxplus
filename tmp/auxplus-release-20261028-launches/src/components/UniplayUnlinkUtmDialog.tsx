import { useState } from "react";
import { Loader2, Search, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteSmartApp, ensureIptvToken, findUtmActivationsByMac, getLastIssuedIptvToken, type IptvPanelCreds, type SmartAppEntry } from "@/lib/iptvPanelApi";

export function UniplayUnlinkUtmDialog({ creds, onToken, onClose }: {
  creds: IptvPanelCreds; onToken: (token: string) => void; onClose: () => void;
}) {
  const [mac, setMac] = useState("");
  const [entries, setEntries] = useState<SmartAppEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(false);
  const [error, setError] = useState("");
  const authenticate = async () => {
    const ensured = await ensureIptvToken(creds);
    onToken(ensured.token);
    return { ...creds, bearerToken: ensured.token };
  };
  const lookup = async () => {
    setBusy(true); setEntries(null); setReleased(false); setError("");
    try {
      setEntries(await findUtmActivationsByMac(await authenticate(), mac));
      const token = getLastIssuedIptvToken(); if (token) onToken(token);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao buscar vínculo UTM";
      setError(message); toast.error(message);
    }
    finally { setBusy(false); }
  };
  const unlink = async (entry: SmartAppEntry) => {
    if (!window.confirm(`Desvincular o MAC ${entry.mac} da conta UTM? As listas serão apagadas e a validade do app será encerrada.`)) return;
    setBusy(true);
    setError("");
    try {
      const auth = await authenticate();
      await deleteSmartApp(auth, entry.id);
      const remaining = await findUtmActivationsByMac(auth, entry.mac);
      setEntries(remaining);
      setReleased(remaining.length === 0);
      const token = getLastIssuedIptvToken(); if (token) onToken(token);
      if (remaining.length === 0) toast.success("O UniPlay confirmou a remoção do vínculo ativo");
      else setError("O UniPlay recebeu a solicitação, mas ainda retorna um vínculo ativo para este MAC. A liberação não foi confirmada.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao desvincular UTM";
      setError(message); toast.error(message);
    }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Desvincular UTM por MAC</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Procura o vínculo do aparelho nas ativações do painel, inclusive quando o usuário IPTV foi excluído.</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
        <Label htmlFor="utm-recovery-mac">MAC do UTM Play</Label>
        <Input id="utm-recovery-mac" className="font-mono" placeholder="aa:bb:cc:dd:ee:ff" value={mac} disabled={busy} autoComplete="off" spellCheck={false} onChange={(e) => { setMac(e.target.value); setEntries(null); setReleased(false); }} />
        <Button type="submit" disabled={busy || !mac.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Buscar vínculo</Button>
      </form>
      {error ? <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
      {entries?.map((entry) => <div key={entry.id} className="space-y-2 rounded-md border p-3 text-sm"><p className="font-mono">{entry.mac}</p><p>Usuário anterior: {entry.username || "indisponível no painel"}</p><Button variant="destructive" disabled={busy} onClick={() => void unlink(entry)}><Unlink2 className="h-4 w-4" />Desvincular este MAC</Button></div>)}
      {entries?.length === 0 ? <p className="text-sm text-muted-foreground">{released ? "O painel não mostra mais um vínculo ativo para este MAC. Você pode tentar a ativação na nova lista." : "Nenhum vínculo ativo encontrado nas ativações acessíveis à sua conta. Se o UTM continua informando que está em uso, o suporte UniPlay/UTM precisará liberar o MAC; o AuxPlus não consegue forçar essa liberação."}</p> : null}
    </DialogContent>
  </Dialog>;
}
