import { useMemo, useState } from "react";
import { eachDayOfInterval, format, parseISO, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface RevenueData {
  createdAt: string | null;
  dueDate: string | null;
  price: number;
}

export function RevenueHeatmap({
  items = []
}: {
  items?: RevenueData[];
}) {
  const [hint, setHint] = useState<string | null>(null);

  const { weeks, max } = useMemo(() => {
    const end = startOfDay(new Date());
    const start = subDays(end, 83);
    const days = eachDayOfInterval({ start, end });
    const revenues = new Map<string, number>();

    // Rastreia receita por data de criação do item (quando foi criado/vendido/atualizado)
    for (const item of items) {
      if (item.price <= 0) continue;

      // Usa createdAt como data de receita (quando o cliente/produto foi criado/comprado)
      const dateStr = item.createdAt;
      if (!dateStr) continue;

      try {
        const date = parseISO(String(dateStr));
        const key = format(date, "yyyy-MM-dd");

        // Verifica se a data está dentro do intervalo
        if (date >= start && date <= end) {
          revenues.set(key, (revenues.get(key) || 0) + item.price);
        }
      } catch {
        // Ignora datas inválidas
      }
    }

    const mapped = days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return { day, key, revenue: revenues.get(key) || 0 };
    });

    const max = Math.max(1, ...mapped.map((d) => d.revenue));
    const weeks: (typeof mapped)[] = [];
    for (let i = 0; i < mapped.length; i += 7) {
      weeks.push(mapped.slice(i, i + 7));
    }
    return { weeks, max };
  }, [items]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="w-full">
      <div
        className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        aria-live="polite"
      >
        {hint ?? (
          <span className="text-muted-foreground">
            Passe o mouse sobre um dia para ver quanto você ganhou
          </span>
        )}
      </div>
      <div
        className="flex w-full gap-1 sm:gap-1.5"
        role="img"
        aria-label="Mapa de calor de receita nos últimos 12 semanas"
        onMouseLeave={() => setHint(null)}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5">
            {week.map(({ day, key, revenue }) => {
              const intensity =
                revenue === 0 ? 0 : Math.ceil((revenue / max) * 4);
              const label = `${format(day, "dd MMM yyyy", { locale: ptBR })}: ${formatCurrency(revenue)}`;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  onMouseEnter={() => setHint(label)}
                  onFocus={() => setHint(label)}
                  onBlur={() => setHint(null)}
                  className={cn(
                    "aspect-square w-full rounded-[3px] outline-none ring-offset-background transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring sm:rounded-md",
                    intensity === 0 && "bg-muted-foreground/20",
                    intensity === 1 && "bg-emerald-400/30",
                    intensity === 2 && "bg-emerald-500/50",
                    intensity === 3 && "bg-emerald-600/75",
                    intensity >= 4 && "bg-emerald-600",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Densidade de receita · últimos ~84 dias
      </p>
    </div>
  );
}

export function collectRevenueData(
  items: { createdAt?: string | null; dueDate?: string | null; price: number }[],
) {
  return items.map((i) => ({
    createdAt: i.createdAt || null,
    dueDate: i.dueDate || null,
    price: i.price,
  }));
}
