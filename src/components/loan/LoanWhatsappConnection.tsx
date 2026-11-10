import { useState } from "react";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Unplug } from "lucide-react";
import type { useLoanWhatsappConnection } from "@/hooks/useLoanWhatsappConnection";
import { useHideBalance } from "@/hooks/useHideBalance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function LoanWhatsappConnection({ connection: wa }: { connection: ReturnType<typeof useLoanWhatsappConnection> }) {
  const { phone } = useHideBalance();
  const [confirm, setConfirm] = useState(false);
  return <details className="rounded-xl border bg-card">
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">WhatsApp desta pasta <span className={`ml-2 text-xs font-normal ${wa.status === 'open' ? 'text-success' : 'text-muted-foreground'}`}>{wa.status === 'open' ? 'Conectado' : wa.qrBase64 ? 'Escaneie o QR' : 'Conectar outro número'}</span></summary>
    <div className="space-y-3 border-t p-4">
      <p className="text-xs text-muted-foreground">Conecte aqui o número dos empréstimos. Os lembretes desta pasta sairão por ele. O WhatsApp de Conexões continua dedicado ao IPTV.</p>
      {wa.status === 'open' ? <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" /><div className="min-w-0"><p className="text-sm font-medium">{wa.connectedProfile?.phone ? phone(wa.connectedProfile.phone) : 'WhatsApp conectado'}</p>{wa.connectedProfile?.profileName && <p className="break-words text-xs text-muted-foreground">{wa.connectedProfile.profileName}</p>}</div></div> : wa.qrBase64 ? <div className="space-y-2"><img src={wa.qrBase64} alt="QR Code do WhatsApp de empréstimos desta pasta" className="mx-auto h-auto w-full max-w-56 rounded-lg bg-white p-2" /><p className="text-center text-xs text-muted-foreground">No outro número, abra WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie este QR.</p></div> : <p className="text-sm text-muted-foreground">Gere o QR Code para conectar o número que atenderá os empréstimos.</p>}
      {wa.pairingCode && <p className="break-all text-center font-mono text-sm">{wa.pairingCode}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-auto min-h-10 whitespace-normal text-xs" disabled={wa.busy || !wa.runtime} onClick={() => void (wa.status === 'open' ? wa.checkStatus() : wa.refreshQr())}>{wa.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}{wa.status === 'open' ? 'Conferir conexão' : wa.qrBase64 ? 'Atualizar QR' : 'Gerar QR'}</Button>
        <Button type="button" className="h-auto min-h-10 whitespace-normal text-xs" variant="outline" disabled={wa.busy || !wa.runtime} onClick={() => void wa.checkStatus()}><RefreshCw className="h-4 w-4" />Atualizar status</Button>
        {wa.status === 'open' && <Button type="button" className="col-span-2 h-10 text-xs" variant="outline" disabled={wa.busy} onClick={() => setConfirm(true)}><Unplug className="h-4 w-4" />Desconectar número desta pasta</Button>}
      </div>
      {!wa.runtime && <p className="text-xs text-muted-foreground">Aguardando a API do WhatsApp configurada pelo administrador.</p>}
      <p className="text-xs text-muted-foreground">As respostas recebidas neste número ficam para atendimento manual. O bot de IPTV usa a conexão principal.</p>
    </div>
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>Desconectar WhatsApp dos empréstimos?</DialogTitle><DialogDescription>Os lembretes desta pasta ficarão aguardando reconexão. A conexão de IPTV será mantida.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="destructive" onClick={() => { setConfirm(false); void wa.disconnect(); }}>Desconectar</Button></DialogFooter></DialogContent></Dialog>
  </details>;
}
