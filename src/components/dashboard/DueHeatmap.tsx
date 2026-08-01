import { useMemo, useState } from "react";
import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function DueHeatmap({ dueDates }: { dueDates: (string | null)[] }) {
  const [hint, setHint] = useState<string | null>(null);

  const { weeks, max } = useMemo(() => {
    const end = startOfDay(new Date());
    const start = subDays(end, 83);
    const days = eachDayOfInterval({ start, end });
    const counts = new Map<string, number>();
    for (const d of dueDates) {
      if (!d) continue;
      const key = String(d).slice(0, 10);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const mapped = days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      return { day, key, count: counts.get(key) || 0 };
    });
    const max = Math.max(1, ...mapped.map((d) => d.count));
    const weeks: (typeof mapped)[] = [];
    for (let i = 0; i < mapped.length; i += 7) {
      weeks.push(mapped.slice(i, i + 7));
    }
    return { weeks, max };
  }, [dueDates]);

  return (
    <div className="w-full">
      <div
        className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        aria-live="polite"
      >
        {hint ?? (
          <span className="text-muted-foreground">
            Passe o mouse sobre um dia para ver os vencimentos
          </span>
        )}
      </div>
      <div
        className="flex w-full gap-1 sm:gap-1.5"
        role="img"
        aria-label="Mapa de calor de vencimentos nos últimos 12 semanas"
        onMouseLeave={() => setHint(null)}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5">
            {week.map(({ day, key, count }) => {
              const intensity = count === 0 ? 0 : Math.ceil((count / max) * 4);
              const label = `${format(day, "dd MMM yyyy", { locale: ptBR })}: ${count} vencimento${count === 1 ? "" : "s"}`;
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
                    intensity === 1 && "bg-primary/30",
                    intensity === 2 && "bg-primary/50",
                    intensity === 3 && "bg-primary/75",
                    intensity >= 4 && "bg-primary",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Densidade de vencimentos · últimos ~84 dias
      </p>
    </div>
  );
}

export function collectDueDates(items: { dueDate?: string | null }[]) {
  return items.map((i) => (i.dueDate ? String(i.dueDate).slice(0, 10) : null));
}
