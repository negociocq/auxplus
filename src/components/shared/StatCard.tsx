import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const toneClass = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  delay = 0,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof toneClass;
  delay?: number;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className={compact ? "ax-surface flex min-w-0 items-center gap-2.5 p-3" : "ax-surface p-4 sm:p-5"}
    >
      {compact ? <>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClass[tone])}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">{label}</p>
          <p className="mt-0.5 break-words text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl">{value}</p>
          {hint ? <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{hint}</p> : null}
        </div>
      </> : <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10",
            toneClass[tone],
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>

      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>

      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      </>}
    </motion.div>
  );
}
