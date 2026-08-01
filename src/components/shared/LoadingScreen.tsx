import { BrandLogo } from "@/components/shared/BrandLogo";

export function LoadingScreen({
  label = "Carregando AuxPlus…",
}: {
  label?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden ax-gradient-mesh">
      <div
        aria-hidden
        className="pointer-events-none absolute h-56 w-56 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-4">
        <BrandLogo size="lg" className="drop-shadow-sm animate-[pulse_2.2s_ease-in-out_infinite]" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-primary/15">
          <div className="h-full w-1/2 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-primary/70" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
