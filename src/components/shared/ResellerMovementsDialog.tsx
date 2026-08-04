import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Coins,
  History,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import type { User } from "@/types";
import {
  loadAutomationsConfig,
  loadAutomationsConfigRemote,
} from "@/lib/automationsConfig";
import { loadIptvPlatformConfig } from "@/lib/platformApi";
import {
  ensureIptvToken,
  listIptvResellerLogs,
  listIptvResellers,
  resolveIptvResellerPanelId,
  summarizeResellerMovements,
  type IptvPanelCreds,
  type IptvResellerMovement,
} from "@/lib/iptvPanelApi";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  /** Login do revendedor no painel (para resolver o id quando não houver `resellerId`) */
  username?: string;
  /** Nome para exibir no topo (opcional) */
  displayName?: string;
  /** ID numérico do revendedor no painel (ex.: aba Revendedores) */
  resellerId?: number | string | null;
  /** Quando definido, mostra o botão "Aplicar no item" (recalcula créditos comprados) */
  onApply?: (movements: IptvResellerMovement[]) => void;
};

function formatLogAt(raw?: string): string {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.test(s)) {
    const d = s.slice(0, 10).split("-");
    const time = s.slice(11, 19);
    const base = `${d[2]}/${d[1]}/${d[0]}`;
    return time ? `${base} ${time}` : base;
  }
  return s;
}

async function buildPanelCreds(userId: string): Promise<IptvPanelCreds> {
  const cfg = await loadAutomationsConfigRemote(userId).catch(() =>
    loadAutomationsConfig(userId),
  );
  const plat = await loadIptvPlatformConfig();
  const ensured = await ensureIptvToken({
    apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
    bearerToken: cfg.iptvBearerToken?.trim() || "",
    username: cfg.iptvUsername?.trim() || undefined,
    password: cfg.iptvPassword || undefined,
    defaultPackage: plat.packageId || "1",
    regPassword: plat.regPassword || undefined,
    apiProxyUrl: plat.apiProxyUrl || undefined,
  });
  return {
    apiBaseUrl: plat.apiBaseUrl || cfg.iptvApiBaseUrl,
    bearerToken: ensured.token,
    username: cfg.iptvUsername?.trim() || undefined,
    password: cfg.iptvPassword || undefined,
    defaultPackage: plat.packageId.trim() || "1",
    regPassword: plat.regPassword?.trim() || undefined,
    apiProxyUrl: plat.apiProxyUrl?.trim() || undefined,
  };
}

/**
 * Logs de Movimentações de um revendedor (UniPlay). Busca em
 * `/logs-reseller/{id}`, monta a tabela e calcula o valor por unidade.
 */
export function ResellerMovementsDialog({
  open,
  onOpenChange,
  user,
  username,
  displayName,
  resellerId,
  onApply,
}: Props) {
  const [movements, setMovements] = useState<IptvResellerMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const creds = await buildPanelCreds(user.id);
        let id: number | string | null = resellerId ?? null;
        if (id == null || String(id).trim() === "") {
          if (!username) throw new Error("Revendedor sem identificação.");
          const rows = await listIptvResellers(creds, {
            search: username,
            perPage: 100,
          });
          const hit = rows.find(
            (r) =>
              String(r.username || "").toLowerCase() ===
              String(username).toLowerCase(),
          );
          id = hit ? resolveIptvResellerPanelId(hit) : null;
        }
        if (id == null) throw new Error("Não foi possível achar o revendedor no UniPlay.");
        const moves = await listIptvResellerLogs(creds, id);
        if (cancelled) return;
        setMovements(moves);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Falha ao carregar movimentações";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, user, username, resellerId, nonce]);

  const summary = summarizeResellerMovements(movements);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[95vw] max-w-[1200px] max-h-[80vh] flex-col overflow-hidden p-0 sm:max-w-[1200px] sm:max-h-[80vh] sm:p-0">
        <DialogHeader className="shrink-0 px-4 pb-1 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Movimentações
          </DialogTitle>
          <DialogDescription>
            Logs de recarga do revendedor{displayName ? ` · ${displayName}` : ""}
            {username ? ` (${username})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 sm:px-6">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="outline" className="tabular-nums">
              <Coins className="mr-1 h-3 w-3" /> {summary.credits} créditos
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              <Wallet className="mr-1 h-3 w-3" /> {formatMoney(summary.faturado)}
            </Badge>
            {summary.unitPrice > 0 ? (
              <Badge variant="outline" className="tabular-nums">
                R$<span className="ml-0.5" />
                {summary.unitPrice.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                /créd.
              </Badge>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={loading}
            onClick={() => setNonce((n) => n + 1)}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Atualizar
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 sm:px-6">
          {loading && movements.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando movimentações…
            </p>
          ) : error ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Não foi possível carregar
              </p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <History className="h-6 w-6 opacity-40" />
              <p>Sem movimentações de recarga para esse revendedor.</p>
            </div>
          ) : (
            <>
              {/* Mobile: cartões com todas as informações */}
              <ul className="space-y-2 sm:hidden">
                {movements.map((m) => (
                  <li
                    key={String(m.id)}
                    className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {formatLogAt(m.at)}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">
                        #{String(m.id)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span>
                        Qtd: <b className="tabular-nums">{m.credits}</b>
                      </span>
                      <span>
                        Unidade:{" "}
                        <b className="tabular-nums">
                          {m.unitPrice > 0
                            ? m.unitPrice.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </b>
                      </span>
                      <span>
                        Faturado:{" "}
                        <b className="tabular-nums">{formatMoney(m.faturado)}</b>
                      </span>
                    </div>
                    {m.toUser || m.fromUser || m.obs ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {m.toUser || m.fromUser
                          ? `${m.fromUser || "?"} → ${m.toUser || "?"}`
                          : m.obs}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {/* Desktop: tabela ocupa a largura do modal, scroll só no corpo */}
              <div className="hidden sm:block">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap px-3 py-2">ID</TableHead>
                      <TableHead className="whitespace-nowrap px-3 py-2 text-right">Quantidade</TableHead>
                      <TableHead className="whitespace-nowrap px-3 py-2 text-right">Faturado</TableHead>
                      <TableHead className="whitespace-nowrap px-3 py-2">Data</TableHead>
                      <TableHead className="whitespace-nowrap px-3 py-2 text-right">Unidade</TableHead>
                      <TableHead className="w-full px-3 py-2">Obs / De → Para</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={String(m.id)}>
                        <TableCell className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {String(m.id)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {m.credits}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {formatMoney(m.faturado)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {formatLogAt(m.at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {m.unitPrice > 0
                            ? m.unitPrice.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="w-full px-3 py-2 break-words text-muted-foreground">
                          {m.toUser || m.fromUser
                            ? `${m.fromUser || "?"} → ${m.toUser || "?"}`
                            : m.obs || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        {onApply && movements.length > 0 ? (
          <div className="flex shrink-0 justify-end border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              disabled={loading || summary.credits <= 0}
              onClick={() => onApply(movements)}
            >
              <Check className="h-4 w-4" />
              Aplicar no item (recalcular créditos comprados)
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}