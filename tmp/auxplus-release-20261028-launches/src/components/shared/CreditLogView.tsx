import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, Coins } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  fmtCreditValue,
  getCreditLog,
  subscribeCreditLog,
  type CreditLogEntry,
} from "@/lib/creditLog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function ago(at: number) {
  try {
    return formatDistanceToNow(new Date(at), {
      addSuffix: true,
      locale: ptBR,
    });
  } catch {
    return "";
  }
}

function EntryRow({ entry }: { entry: CreditLogEntry }) {
  const negative = (entry.delta ?? 0) < 0;
  return (
    <li className="rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight">{entry.label}</p>
          {entry.detail ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {entry.detail}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {typeof entry.delta === "number" && entry.delta !== 0 ? (
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                negative
                  ? "border-destructive/30 text-destructive"
                  : "border-success/40 text-success",
              )}
            >
              {negative ? "" : "+"}
              {entry.delta}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">
          {fmtCreditValue(entry.oldBalance)}
        </span>
        <ArrowRight className="h-3 w-3 text-primary" />
        <span className="tabular-nums font-medium text-foreground">
          {fmtCreditValue(entry.newBalance)}
        </span>
        <span className="text-muted-foreground/50">créditos</span>
        <span className="ml-auto text-[11px] text-muted-foreground/60">
          {ago(entry.at)}
        </span>
      </div>
    </li>
  );
}

/**
 * Log de créditos UniPlay: últimas 5 recargas de revendedor + histórico de
 * toda ação que alterou o saldo (saldo antigo → novo).
 */
export function CreditLogView() {
  const { user } = useApp();
  const userId = user?.id;
  const [entries, setEntries] = useState<CreditLogEntry[]>([]);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      return;
    }
    setEntries(getCreditLog(userId));
    const off = subscribeCreditLog(() => setEntries(getCreditLog(userId)));
    return off;
  }, [userId]);

  const recargas = entries.filter((e) => e.type === "recarga").slice(0, 5);

  return (
    <div className="space-y-4">
      <section className="ax-surface space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Créditos</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Toda ação que altera o saldo UniPlay (renovação, teste, recarga) com
            o saldo antigo → novo.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Coins className="h-6 w-6 opacity-40" />
            <p>Nenhuma alteração de crédito registrada ainda.</p>
            <p className="text-xs">
              Quando você renovar, ativar um teste ou mandar créditos para um
              revendedor, aparece aqui com o saldo antes e depois.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.slice(0, 50).map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>

      {recargas.length > 0 ? (
        <section className="ax-surface space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Últimas recargas de revendedores
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              As 5 recargas mais recentes.
            </p>
          </div>
          <ul className="space-y-2">
            {recargas.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}