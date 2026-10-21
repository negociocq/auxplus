import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (value: number) => String(value).padStart(2, "0");

/** Calendário que só apresenta os anos, meses e dias dentro do histórico disponível. */
export function BoundedDatePicker({ id, label, value, min, max, disabled, onChange }: {
  id: string; label: string; value: string; min: string; max: string; disabled?: boolean; onChange: (date: string) => void;
}) {
  const clampMonth = useCallback((month: string) => month < min.slice(0, 7) ? min.slice(0, 7) : month > max.slice(0, 7) ? max.slice(0, 7) : month, [min, max]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => clampMonth(value.slice(0, 7)));
  useEffect(() => { setView(clampMonth(value.slice(0, 7))); }, [value, clampMonth]);
  const [year, month] = view.split("-").map(Number);
  const firstYear = Number(min.slice(0, 4));
  const lastYear = Number(max.slice(0, 4));
  const years = Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) => firstYear + index);
  const availableMonths = months.map((name, index) => ({ name, number: index + 1, key: `${year}-${pad(index + 1)}` })).filter(({ key }) => key >= min.slice(0, 7) && key <= max.slice(0, 7));
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return <Popover open={open} onOpenChange={(next) => { if (next) setView(clampMonth(value.slice(0, 7))); setOpen(next); }}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" disabled={disabled} aria-label={`${label}: ${value.split("-").reverse().join("/")}`} className="w-full justify-between font-normal"><span>{value.split("-").reverse().join("/")}</span><CalendarDays className="h-4 w-4 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-3" align="start" aria-label={`Calendário ${label}`}>
      <div className="mb-3 flex gap-2">
        <Select value={pad(month)} onValueChange={(next) => setView(`${year}-${next}`)}><SelectTrigger className="flex-1" aria-label="Mês"><SelectValue /></SelectTrigger><SelectContent>{availableMonths.map((entry) => <SelectItem key={entry.key} value={pad(entry.number)}>{entry.name}</SelectItem>)}</SelectContent></Select>
        <Select value={String(year)} onValueChange={(next) => setView(clampMonth(`${next}-${pad(month)}`))}><SelectTrigger className="w-24" aria-label="Ano"><SelectValue /></SelectTrigger><SelectContent>{years.map((entry) => <SelectItem key={entry} value={String(entry)}>{entry}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((day, index) => <span key={`weekday-${index}`} className="py-1 text-xs text-muted-foreground" aria-hidden="true">{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = `${view}-${pad(day)}`;
          return date < min || date > max ? <span key={date} /> : <Button key={date} type="button" size="sm" variant={date === value ? "default" : "ghost"} className="h-9 w-full p-0" aria-label={`${pad(day)}/${pad(month)}/${year}`} aria-pressed={date === value} onClick={() => { onChange(date); setOpen(false); }}>{day}</Button>;
        })}
      </div>
    </PopoverContent>
  </Popover>;
}
