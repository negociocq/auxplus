import { CalendarClock, FlaskConical, Headset, Ticket, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function UniPlayNavigation({ clients, resellers, tests }: { clients: number; resellers: number; tests?: number }) {
  const items = [
    { value: "clientes", label: "Clientes", count: clients },
    { value: "revendedores", label: "Revendedores", icon: Users, count: resellers },
    { value: "testes", label: "Testes", icon: FlaskConical, count: tests },
    { value: "renovacoes", label: "Renovações", icon: Wallet },
    { value: "atendimento", label: "Atendimento", icon: Headset },
    { value: "tickets", label: "Tickets", icon: Ticket },
    { value: "novidades", label: "Novidades e jogos", icon: CalendarClock },
  ];
  return <TabsList aria-label="Seções principais do UniPlay" className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border/70 bg-transparent p-0 pb-2">
    {items.map(({ value, label, icon: Icon, count }) => <TabsTrigger key={value} value={value}
      className="group h-10 shrink-0 gap-1 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium shadow-none transition-colors hover:bg-muted/70 data-[state=active]:border-primary/20 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none sm:gap-1.5 sm:px-3 sm:text-sm">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span>{label}</span>
      {typeof count === "number" && count > 0 && <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px] leading-none group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">{count}</Badge>}
    </TabsTrigger>)}
  </TabsList>;
}
