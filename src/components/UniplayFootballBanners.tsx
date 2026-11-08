import { useEffect, useRef, useState } from "react";
import { Download, Expand, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brasiliaDay, getFootballMatches } from "@/lib/uniplayDiscover";
import { bannerDays, bannerPages, drawFootballBanner, loadBannerImages, type BannerRegion } from "@/lib/footballBanner";
import { FootballStatusAutomation } from "@/components/FootballStatusAutomation";

type Schedule = Awaited<ReturnType<typeof getFootballMatches>>;
type BannerState = { day: string; schedule?: Schedule; error?: string };

/** Opens the selected day's banner using the already loaded games and TV guide. */
export function UniplayGameBannerDialog({ day, schedule, open, onOpenChange, initialRegion = "national" }: {
  day: string; schedule: Schedule; open: boolean; onOpenChange: (open: boolean) => void; initialRegion?: BannerRegion;
}) {
  const [region, setRegion] = useState<BannerRegion>(initialRegion);
  useEffect(() => { if (open) setRegion(initialRegion); }, [open, initialRegion]);
  const days = bannerDays();
  const label = day === days[0] ? "Hoje" : day === days[1] ? "Amanhã"
    : new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="p-4 sm:max-w-xl">
      <DialogHeader><DialogTitle>Visualizar banner · {label}</DialogTitle>
        <DialogDescription>AuxPlus · escolha o banner nacional ou internacional da data selecionada.</DialogDescription></DialogHeader>
      <div className="flex gap-2" role="group" aria-label="Tipo do banner">
        <Button variant={region === "national" ? "default" : "outline"} aria-pressed={region === "national"} onClick={() => setRegion("national")}>Nacional</Button>
        <Button variant={region === "international" ? "default" : "outline"} aria-pressed={region === "international"} onClick={() => setRegion("international")}>Internacional</Button>
      </div>
      <BannerDay key={`${day}:${region}`} day={day} label={label} region={region} state={{ day, schedule }} />
    </DialogContent>
  </Dialog>;
}

export function UniplayFootballBanners() {
  const [today, setToday] = useState(brasiliaDay);
  const [revision, setRevision] = useState(0);
  const [states, setStates] = useState<BannerState[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const tick = () => setToday(brasiliaDay());
    const interval = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setRevision(n => n + 1);
    }, 300000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const days = bannerDays(new Date(`${today}T12:00:00Z`));
    setStates(days.map(day => ({ day }))); setLoading(true);
    void Promise.all(days.map(async day => {
      try {
        const schedule = await getFootballMatches(day, controller.signal);
        if (!controller.signal.aborted) setStates(current => current.map(s => s.day === day ? { day, schedule } : s));
      } catch (e) {
        if (!controller.signal.aborted) setStates(current => current.map(s => s.day === day ? { day, error: e instanceof Error ? e.message : "Falha ao consultar jogos." } : s));
      }
    })).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [today, revision]);

  // Derive the day pair from the clock so an old banner is never labelled as today at midnight.
  const days = bannerDays(new Date(`${today}T12:00:00Z`));
  return <div className="space-y-4">
    <FootballStatusAutomation />
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">Banners AuxPlus</h3><p className="mt-1 text-sm text-muted-foreground">Hoje e amanhã: nacional em verde e destaques internacionais em roxo. PNG vertical de 1080 × 1920 para o Status do WhatsApp.</p></div>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(n => n + 1)}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar banners</Button>
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {days.flatMap((day, i) => (["national", "international"] as const).map(region => <BannerDay key={`${day}:${region}`} day={day} label={i === 0 ? "Hoje" : "Amanhã"} region={region} state={states.find(s => s.day === day)} />))}
    </div>
  </div>;
}

function BannerDay({ day, label, state, region }: { day: string; label: string; state?: BannerState; region: BannerRegion }) {
  const [page, setPage] = useState(0);
  const [image, setImage] = useState("");
  const [renderError, setRenderError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const schedule = state?.schedule;
  const category = region === "national" ? "Nacional" : "Internacional";
  const pages = schedule ? bannerPages(schedule.matches, day, region) : [[]];
  const currentPage = Math.min(page, pages.length - 1);
  useEffect(() => {
    setImage(""); setRenderError("");
    if (!schedule || !canvas.current) return;
    let active = true;
    const sheets = bannerPages(schedule.matches, day, region);
    const index = Math.min(page, sheets.length - 1);
    void loadBannerImages(sheets[index]).then(images => {
      if (!active || !canvas.current) return;
      try {
      drawFootballBanner(canvas.current, day, label, sheets[index], index, sheets.length, schedule.partial, region, images);
      setImage(canvas.current.toDataURL("image/png"));
      } catch { setRenderError("Não foi possível gerar o banner neste navegador. Atualize para tentar novamente."); }
    }).catch(() => { if (active) setRenderError("Não foi possível carregar o banner. Atualize para tentar novamente."); });
    return () => { active = false; };
  }, [schedule, day, label, page, region]);
  const filename = `auxplus-${region === "national" ? "nacional" : "internacional"}-${day}${pages.length > 1 ? `-${currentPage + 1}` : ""}.png`;
  return <article className="space-y-3 rounded-xl border bg-card p-4">
    <div className="flex items-center justify-between"><h4 className="font-semibold">{label} · {category}</h4><span className="text-sm text-muted-foreground">{new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
    <canvas ref={canvas} className="hidden" aria-hidden="true" />
    {state?.error || renderError ? <p role="alert" className="rounded-lg border border-destructive/30 p-6 text-sm text-destructive">{state?.error || renderError}</p>
      : !schedule || !image ? <div role="status" className="flex aspect-[9/16] items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Gerando banner…</div>
      : <button type="button" className="mx-auto block w-full max-w-[360px] overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Ampliar banner ${category.toLowerCase()} de ${label.toLowerCase()}`} onClick={() => setExpanded(true)}>
        <img src={image} alt={`AuxPlus: ${category}, ${label.toLowerCase()}, ${day}, com horários e onde assistir`} className="aspect-[9/16] w-full" />
      </button>}
    {schedule?.partial && <p role="status" className="text-xs text-amber-600">Agenda parcial. A imagem indica que alguns jogos podem estar ausentes.</p>}
    {schedule?.broadcastsUnavailable && <p role="status" className="text-xs text-amber-600">Guia de canais indisponível. O banner mostra transmissão a confirmar.</p>}
    {image && schedule && !state?.error && !renderError && <>
      {pages.length > 1 && <div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-xs">{currentPage + 1} de {pages.length}</span><Button size="sm" variant="outline" disabled={currentPage === pages.length - 1} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div>}
      <div className="flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={() => setExpanded(true)}><Expand className="mr-2 h-4 w-4" />Visualizar</Button>
        <Button size="sm" asChild><a href={image} download={filename}><Download className="mr-2 h-4 w-4" />Baixar PNG</a></Button></div>
      <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="p-4 sm:max-w-xl"><DialogHeader><DialogTitle>AuxPlus · {label} · {category}</DialogTitle><DialogDescription>{category} · horários de Brasília · página {currentPage + 1} de {pages.length}</DialogDescription></DialogHeader>
        <img src={image} alt={`Banner AuxPlus de ${label.toLowerCase()}`} className="mx-auto w-full max-w-[420px] rounded-lg" />
        <Button asChild><a href={image} download={filename}><Download className="mr-2 h-4 w-4" />Baixar para Status</a></Button>
      </DialogContent></Dialog>
    </>}
  </article>;
}
