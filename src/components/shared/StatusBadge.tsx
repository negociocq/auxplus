import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/types";
import { cn } from "@/lib/utils";

const map: Record<ItemStatus, { label: string; className: string }> = {
  "Longe de Vencer": {
    label: "Longe",
    className:
      "border border-success/25 bg-background/90 text-success shadow-sm hover:bg-background",
  },
  "Perto de Vencer": {
    label: "Perto",
    className:
      "border border-warning/25 bg-background/90 text-warning shadow-sm hover:bg-background",
  },
  "Já Vencido": {
    label: "Vencido",
    className:
      "border border-destructive/25 bg-background/90 text-destructive shadow-sm hover:bg-background",
  },
  "Sem Vencimento": {
    label: "Sem prazo",
    className:
      "border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-background",
  },
};

export function StatusBadge({
  status,
  full,
  className,
}: {
  status: ItemStatus;
  full?: boolean;
  className?: string;
}) {
  const cfg = map[status];
  return (
    <Badge className={cn(cfg.className, className)}>
      {full ? status : cfg.label}
    </Badge>
  );
}
