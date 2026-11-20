import { useEffect, useState } from "react";
import { Download, Expand, Loader2, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { recoveryRequest } from "@/lib/whatsappRecovery";
import { type CatalogBannerPage } from "@/lib/catalogBanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusAutomation } from "@/components/StatusAutomation";
import { UniplayFootballBanners } from "@/components/UniplayFootballBanners";

export function StatusBannerHub({ initialCategory = "games" }: { initialCategory?: "games" | "catalog" }) {
  const [category, setCategory] = useState(initialCategory);
  return <div className="space-y-4">
    <div><h3 className="text-lg font-semibold">Central de banners e Status</h3><p className="mt-1 text-sm text-muted-foreground">Escolha a categoria para visualizar, baixar, agendar ou iniciar a fila de postagem agora.</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Categoria dos banners">
      <Button variant={category === "games" ? "default" : "outline"} aria-pressed={category === "games"} onClick={() => setCategory("games")}>Jogos</Button>
      <Button variant={category === "catalog" ? "default" : "outline"} aria-pressed={category === "catalog"} onClick={() => setCategory("catalog")}>Filmes e séries</Button>
    </div>
    {category === "games" ? <UniplayFootballBanners /> : <CatalogStatusBanners />}
  </div>;
}
function CatalogStatusBanners() {
  const { user } = useApp();
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<CatalogBannerPage[]>([]), [day, setDay] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoading(true); setError(""); setPages([]);
    void recoveryRequest(user.id, "content-status-preview", {}, "wa-content-status").then(data => {
      if (active) { setPages(data.pages); setDay(data.day); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Falha ao preparar os banners."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, revision]);
  return <div className="space-y-4">
    <StatusAutomation category="catalog" onChange={() => setRevision(n => n + 1)} />
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">Prévias dos banners de filmes e séries</h4><p className="mt-1 text-sm text-muted-foreground">Quatro títulos por imagem, com versões DUB/LEG e 4K agrupadas. Os títulos já publicados saem das próximas seleções.</p><p className="mt-1 text-xs text-muted-foreground">Quando a Uniplay informa somente o ano, são considerados os títulos do ano atual. A fila já preparada para hoje mantém suas páginas.</p></div><Button size="sm" variant="outline" disabled={loading} onClick={() => setRevision(n => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />Atualizar prévias</Button></div>
    {error && <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 p-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Preparando a seleção do catálogo…</p>}
    {!loading && !error && !pages.length && <p className="rounded-lg border p-6 text-sm text-muted-foreground">Nenhum lançamento novo disponível para esta seleção. Os títulos já publicados não são repetidos nas próximas filas.</p>}
    <div className="grid gap-6 md:grid-cols-2">{pages.map(page => <CatalogBannerCard key={`${revision}:${page.kind}:${page.page}`} page={page} day={day} />)}</div>
  </div>;
}
function CatalogBannerCard({ page, day }: { page: CatalogBannerPage; day: string }) {
  const { user } = useApp();
  const [image, setImage] = useState(""), [error, setError] = useState(""), [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const label = page.kind === "movie" ? "Filmes" : "Séries";
  useEffect(() => {
    if (!user?.id) return;
    let active = true; setImage(""); setError("");
    void recoveryRequest(user.id, "content-status-preview", { kind: page.kind, page: page.page }, "wa-content-status")
      .then(data => { if (active) setImage(data.image); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Não foi possível gerar a imagem."); });
    return () => { active = false; };
  }, [user?.id, page.kind, page.page, revision]);
  return <article className="space-y-3 rounded-xl border bg-card p-4">
    <h4 className="font-semibold">{label} · página {page.page + 1}/{page.total}</h4>
    {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRevision(n => n + 1)}>Tentar novamente</Button></div>
      : !image ? <div role="status" className="flex aspect-[9/16] items-center justify-center gap-2 rounded-lg bg-muted text-sm"><Loader2 className="h-4 w-4 animate-spin" />Gerando banner…</div>
      : <button className="mx-auto block w-full max-w-[360px] overflow-hidden rounded-lg" aria-label={`Ampliar banner de ${label.toLowerCase()}`} onClick={() => setExpanded(true)}><img src={image} className="aspect-[9/16] w-full" alt={`AuxPlus · ${label} · página ${page.page + 1}`} /></button>}
    <p className="text-xs text-muted-foreground">{page.titles.map(title => title.name).join(" · ")}</p>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!image} onClick={() => setExpanded(true)}><Expand className="mr-1 h-4 w-4" />Visualizar</Button><Button asChild size="sm" variant="outline" disabled={!image}><a href={image || undefined} download={`auxplus-${page.kind}-${day}-${page.page + 1}.png`} onClick={event => { if (!image) event.preventDefault(); }}><Download className="mr-1 h-4 w-4" />Baixar PNG</a></Button></div>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>{label} · {page.page + 1}/{page.total}</DialogTitle><DialogDescription>Banner AuxPlus para Status.</DialogDescription></DialogHeader><img src={image} alt={`Banner de ${label.toLowerCase()}`} className="max-h-[72dvh] w-full object-contain" /></DialogContent></Dialog>
  </article>;
}
