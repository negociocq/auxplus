import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  /**
   * sm = sidebar recolhida · md = sidebar expandida · lg/xl = login / loading
   */
  size?: "sm" | "md" | "lg" | "xl";
  /** Só o símbolo (útil na sidebar recolhida) */
  markOnly?: boolean;
  /** Ícone + nome AuxPlus lado a lado (menu expandido) */
  inline?: boolean;
};

function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 overflow-hidden",
        className,
      )}
    >
      <img
        src="/auxplus-logo.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-[165%] w-full max-w-none object-cover object-[center_8%]"
      />
    </span>
  );
}

/**
 * Logo AuxPlus (PNG transparente). Sem fundo preto / caixa.
 */
export function BrandLogo({
  className,
  size = "md",
  markOnly = false,
  inline = false,
}: BrandLogoProps) {
  if (inline) {
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5 select-none",
          className,
        )}
        aria-label="AuxPlus"
      >
        <LogoMark />
        <span className="truncate text-[1.15rem] font-bold tracking-tight text-sidebar-foreground">
          AuxPlus
        </span>
      </div>
    );
  }

  if (markOnly) {
    return <LogoMark className={className} />;
  }

  return (
    <img
      src="/auxplus-logo.png"
      alt="AuxPlus"
      draggable={false}
      className={cn(
        "block object-contain object-center select-none",
        size === "sm" && "h-10 w-10",
        size === "md" && "h-12 w-auto max-w-[10.5rem]",
        size === "lg" && "h-24 w-auto max-w-[13rem]",
        size === "xl" && "h-36 w-auto max-w-[16rem]",
        className,
      )}
    />
  );
}
