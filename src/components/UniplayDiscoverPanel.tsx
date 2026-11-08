import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Loader2, RefreshCw, Trophy, Tv, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UniplayGameBannerDialog } from "@/components/UniplayFootballBanners";
import { bannerDays } from "@/lib/footballBanner";
import { ensureIptvToken, getLastIssuedIptvToken, getUniplayCatalog, type IptvPanelCreds } from "@/lib/iptvPanelApi";
import { brasiliaDay, catalogNews, catalogSeasonNews, getFootballMatches, normalizeCatalog, observeCatalog, mergeCatalogSnapshots, parseCatalogSnapshot, type CatalogSnapshot, type CatalogTitle, type FootballMatch } from "@/lib/uniplayDiscover";
import { catalogGenreOptions, catalogPage, genreKey, groupCatalogVariants } from "@/lib/catalogBrowsing";
import { loadCatalogHistory, saveCatalogHistory } from "@/lib/uniplayCatalogSync";
import { useCatalogGenres } from "@/hooks/useCatalogGenres";
import { useRecentSeasons } from "@/hooks/useRecentSeasons";
import { StatusBannerHub } from "@/components/StatusBannerHub";

// Retain the catalog when navigating away and back, scoped to the connected account.
const catalogCache = new Map<string, { items: CatalogTitle[]; syncedAt: number; baselineAt?: number }>();
const CATALOG_FRESH_MS = 5 * 60 * 1000;
const selectClass = "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:h-10 sm:w-auto";
const dateLabel = (n: number) => new Date(n).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const sections = [{ id: "recent", name: "Recém-adicionados" }, { id: "releases", name: "Últimos lançamentos" },
  { id: "catalog", name: "Catálogo completo" }, { id: "games", name: "Jogos do dia" }, { id: "banners", name: "Banners para Status" }];

export function UniplayDiscoverPanel({ creds, onToken, accountId }: {
  creds: IptvPanelCreds; onToken: (token: string) => void; accountId: string;
}) {
  const [section, setSection] = useState("recent");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [genre, setGenre] = useState("all");
  const catalogTop = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<CatalogTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);
  const [baselineAt, setBaselineAt] = useState<number>();
  const [syncedAt, setSyncedAt] = useState<number>();
  const [day, setDay] = useState(brasiliaDay);
  const [region, setRegion] = useState("all");
  const [gamesScope, setGamesScope] = useState("featured");
  const [broadcastsUnavailable, setBroadcastsUnavailable] = useState(false);
  const [matches, setMatches] = useState<FootballMatch[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [partial, setPartial] = useState(false);
  const [gamesRefresh, setGamesRefresh] = useState(0);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [loadedGamesDay, setLoadedGamesDay] = useState("");
  const latest = useRef({ creds, onToken }); latest.current = { creds, onToken };
  const generation = useRef(0);
  const busy = useRef(false);
  const memorySnapshot = useRef<CatalogSnapshot | null>(null);
  const storageKey = `auxplus:uniplay-catalog:v1:${accountId}:${encodeURIComponent(creds.apiBaseUrl)}:${encodeURIComponent(creds.username || "default")}`;

  const refresh = async () => {
    if (busy.current) return;
    busy.current = true;
    const version = generation.current;
    setLoading(true); setError(""); setSyncWarning(false);
    const cloudHistory = loadCatalogHistory(storageKey).catch(() => {
      if (version === generation.current) setSyncWarning(true);
      return null;
    });
    try {
      const base = latest.current.creds;
      const { token } = await ensureIptvToken(base);
      if (version !== generation.current) return;
      latest.current.onToken(token);
      const catalog = normalizeCatalog(await getUniplayCatalog({ ...base, bearerToken: token }));
      if (version !== generation.current) return;
      let previous = memorySnapshot.current;
      try {
        const saved = parseCatalogSnapshot(localStorage.getItem(storageKey));
        previous = mergeCatalogSnapshots(previous, saved);
      } catch { setStorageWarning(true); }
      previous = mergeCatalogSnapshots(previous, await cloudHistory);
      if (version !== generation.current) return;
      const now = Date.now();
      const observed = observeCatalog(catalog, previous, now);
      // Empty responses must not erase the baseline and make every title appear new later.
      if (catalog.length) {
        memorySnapshot.current = observed.snapshot;
        try { localStorage.setItem(storageKey, JSON.stringify(observed.snapshot)); }
        catch { setStorageWarning(true); }
        setBaselineAt(observed.snapshot.baselineAt);
      }
      setItems(observed.items); setSyncedAt(now);
      catalogCache.delete(storageKey);
      catalogCache.set(storageKey, { items: observed.items, syncedAt: now, baselineAt: observed.snapshot.baselineAt });
      if (catalogCache.size > 3) catalogCache.delete(catalogCache.keys().next().value!);
      if (catalog.length) {
        try {
          const shared = await saveCatalogHistory(storageKey, observed.snapshot);
          if (version !== generation.current) return;
          memorySnapshot.current = shared;
          const mergedItems = observeCatalog(catalog, shared, now).items;
          setItems(mergedItems); setBaselineAt(shared.baselineAt);
          catalogCache.set(storageKey, { items: mergedItems, syncedAt: now, baselineAt: shared.baselineAt });
          try { localStorage.setItem(storageKey, JSON.stringify(shared)); }
          catch { setStorageWarning(true); }
        } catch { if (version === generation.current) setSyncWarning(true); }
      }
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : "Falha ao consultar o catálogo.");
    } finally {
      if (version === generation.current) {
        const token = getLastIssuedIptvToken(); if (token) latest.current.onToken(token);
        busy.current = false; setLoading(false);
      }
    }
  };

  useEffect(() => {
    generation.current++; busy.current = false; memorySnapshot.current = null;
    setItems([]); setSyncedAt(undefined); setBaselineAt(undefined); setStorageWarning(false); setSyncWarning(false);
    const cached = catalogCache.get(storageKey);
    if (cached) {
      setItems(cached.items); setSyncedAt(cached.syncedAt); setBaselineAt(cached.baselineAt); setLoading(false);
    }
    if (!cached || Date.now() - cached.syncedAt >= CATALOG_FRESH_MS) void refresh();
    const version = generation.current;
    return () => { generation.current = version + 1; };
    // Credentials and tokens may refresh without resetting the catalog baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (section !== "games") return;
    const controller = new AbortController();
    setGamesLoading(true); setGamesError(""); setMatches([]); setPartial(false); setBroadcastsUnavailable(false); setLoadedGamesDay(""); setBannerOpen(false);
    void getFootballMatches(day, controller.signal).then(result => {
      if (!controller.signal.aborted) { setMatches(result.matches); setPartial(result.partial); setBroadcastsUnavailable(result.broadcastsUnavailable); setLoadedGamesDay(day); }
    }).catch(e => {
      if (!controller.signal.aborted) setGamesError(e instanceof Error ? e.message : "Falha ao carregar jogos.");
    }).finally(() => { if (!controller.signal.aborted) setGamesLoading(false); });
    return () => controller.abort();
  }, [section, day, gamesRefresh]);

  // Keep the day's agenda and live scores fresh while it is visible.
  useEffect(() => {
    if (section !== "games" || day !== brasiliaDay()) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setGamesRefresh(n => n + 1);
    }, 120000);
    return () => window.clearInterval(timer);
  }, [section, day]);
  useEffect(() => setPage(1), [query, kind, genre, section, storageKey]);
  useEffect(() => { if (section !== "releases" && kind === "seasons") setKind("all"); }, [section, kind]);

  const groupedItems = useMemo(() => groupCatalogVariants(items), [items]);
  const seasonMode = section === "releases" && kind === "seasons";
  const seasonGuide = useRecentSeasons(groupedItems, seasonMode);
  const genreMetadata = useCatalogGenres(seasonGuide.titles, { section, kind, query, page });
  const genreItems = genreMetadata.titles;
  const seasonNews = useMemo(() => {
    const now = Date.now();
    return new Map(genreItems.map(item => [item.key, catalogSeasonNews(item, now)]));
  }, [genreItems, syncedAt]);
  const releaseNews = useMemo(() => {
    const now = Date.now();
    return new Map(genreItems.map(item => [item.key, seasonMode ? seasonNews.get(item.key) : catalogNews(item, now)]));
  }, [genreItems, syncedAt, seasonMode, seasonNews]);
  const genreOptions = useMemo(() => catalogGenreOptions(genreItems.filter(item => kind === "all" || kind === "seasons" && item.kind === "series" || item.kind === kind)), [genreItems, kind]);
  const filtered = useMemo(() => {
    const now = Date.now(), since = now - 7 * 86400000;
    const text = query.trim().toLocaleLowerCase("pt-BR");
    return genreItems.filter(item => (kind === "all" || item.kind === kind || kind === "seasons" && item.kind === "series" && !!seasonNews.get(item.key)) &&
      (item.name.toLocaleLowerCase("pt-BR").includes(text) || item.variantNames.some(name => name.toLocaleLowerCase("pt-BR").includes(text))))
      .filter(item => genre === "all" || (genre === "unknown" ? !item.genres?.length : item.genres?.some(name => genreKey(name) === genre)))
      .filter(item => section === "recent" ? (item.addedAt ?? item.observedAt ?? 0) >= since && (item.addedAt ?? item.observedAt ?? 0) <= now
        : section === "releases" ? !!releaseNews.get(item.key) : true)
      .sort((a, b) => section === "recent" ? (b.addedAt ?? b.observedAt ?? 0) - (a.addedAt ?? a.observedAt ?? 0)
        : section === "releases" ? (releaseNews.get(b.key)?.order ?? 0) - (releaseNews.get(a.key)?.order ?? 0) || a.name.localeCompare(b.name, "pt-BR") : a.name.localeCompare(b.name, "pt-BR"));
  }, [genreItems, kind, query, section, genre, releaseNews, seasonNews]);
  const paginated = useMemo(() => catalogPage(filtered, page), [filtered, page]);
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    catalogTop.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const pageControls = (position: string) => paginated.totalPages > 1 && <nav aria-label={`Páginas do catálogo (${position})`} className="flex flex-wrap items-center justify-between gap-3">
    <span className="text-xs text-muted-foreground">{paginated.first}–{paginated.last} de {filtered.length} títulos · Página {paginated.page} de {paginated.totalPages}</span>
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="outline" disabled={paginated.page === 1} onClick={() => changePage(paginated.page - 1)}>Anterior</Button>
      {paginated.pages.map((number, index) => <span key={number} className="flex items-center gap-1">
        {index > 0 && number - paginated.pages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}
        <Button size="sm" variant={number === paginated.page ? "default" : "outline"} aria-label={`Ir para página ${number}`} aria-current={number === paginated.page ? "page" : undefined} onClick={() => changePage(number)}>{number}</Button>
      </span>)}
      <Button size="sm" variant="outline" disabled={paginated.page === paginated.totalPages} onClick={() => changePage(paginated.page + 1)}>Próxima</Button>
    </div>
  </nav>;
  const visibleMatches = matches.filter(m => (gamesScope === "all" || m.highlight) && (region === "all" || (region === "br" ? m.brazil : !m.brazil))
    && `${m.home} ${m.away} ${m.competition}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  const bannerSchedule = useMemo(() => ({ matches, partial, broadcastsUnavailable }), [matches, partial, broadcastsUnavailable]);

  return <section className="ax-surface min-w-0 space-y-4 p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Clapperboard className="h-5 w-5" />Novidades e jogos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Filmes e séries da Uniplay e agenda de futebol brasileiro e internacional.</p></div>
      {section !== "banners" && <Button variant="outline" size="sm" disabled={section === "games" ? gamesLoading : loading}
        onClick={() => { if (section === "games") setGamesRefresh(n => n + 1); else { void refresh(); if (seasonMode) seasonGuide.retry(); } }}>
        <RefreshCw className={`mr-2 h-4 w-4 ${(section === "games" ? gamesLoading : loading) ? "animate-spin" : ""}`} />Atualizar
      </Button>}
    </div>
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap" role="group" aria-label="Seções de novidades">
      {sections.map(s => <Button key={s.id} size="sm" variant={section === s.id ? "default" : "outline"}
        className="h-auto min-h-11 min-w-0 whitespace-normal px-2 py-2 text-xs leading-snug last:col-span-2 sm:text-sm md:min-h-9 md:px-3 md:last:col-span-1"
        aria-pressed={section === s.id} onClick={() => setSection(s.id)}>{s.name}</Button>)}
    </div>
    {section === "banners" ? <StatusBannerHub /> : <>
    <div ref={catalogTop} className="flex scroll-mt-24 flex-wrap gap-2">
      <Input className="h-11 min-w-0 basis-full sm:h-10 sm:basis-auto sm:flex-1" aria-label="Pesquisar títulos ou jogos" placeholder={section === "games" ? "Buscar time ou competição…" : "Buscar filme ou série…"} value={query} onChange={e => setQuery(e.target.value)} />
      {section === "games" ? <>
        <Input className="w-auto" aria-label="Data dos jogos" type="date" value={day} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }} />
        <Button variant="outline" onClick={() => setDay(brasiliaDay())}>Hoje</Button>
        <Button variant="outline" onClick={() => setDay(bannerDays()[1])}>Amanhã</Button>
        <Button disabled={gamesLoading || !!gamesError || loadedGamesDay !== day} onClick={() => setBannerOpen(true)}>
          <Image className="mr-2 h-4 w-4" />Visualizar banner
        </Button>
        <select aria-label="Destaques dos jogos" className={selectClass} value={gamesScope} onChange={e => setGamesScope(e.target.value)}>
          <option value="featured">Principais jogos</option><option value="all">Todos os jogos</option>
        </select>
        <select aria-label="Região dos jogos" className={selectClass} value={region} onChange={e => setRegion(e.target.value)}>
          <option value="all">Brasil e internacional</option><option value="br">Brasil</option><option value="world">Internacional</option>
        </select>
      </> : <select aria-label="Filtrar por gênero" className={selectClass} value={genre} disabled={loading || !genreOptions.length && genreMetadata.loading} onChange={e => setGenre(e.target.value)}>
        <option value="all">{!genreOptions.length && genreMetadata.loading ? "Carregando gêneros…" : "Todos os gêneros"}</option>
        {genreOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        <option value="unknown">Sem gênero identificado</option>
      </select>}
    </div>
    {section !== "games" && <>
      <div role="group" aria-label="Tipo de conteúdo" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {[{ id: "all", name: "Todos" }, { id: "movie", name: "Filmes" }, { id: "series", name: "Séries" }, ...(section === "releases" ? [{ id: "seasons", name: "Novas temporadas" }] : [])].map(option =>
          <Button key={option.id} size="sm" className="h-auto min-h-11 whitespace-normal py-2 sm:min-h-9" variant={kind === option.id ? "default" : "outline"} aria-pressed={kind === option.id} onClick={() => { setKind(option.id); setGenre("all"); }}>{option.name}</Button>)}
      </div>
      {!loading && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p role="status">{genreMetadata.loading ? "Identificando gêneros por título e ano… " : ""}Gêneros identificados em {genreMetadata.identified} de {groupedItems.length} títulos. Fonte: <a className="underline" href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata</a>. Títulos sem correspondência segura ficam sem gênero.</p>
        <p className="w-full">Carregamento automático por guia público. A comparação dos títulos é feita neste navegador.</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={genreMetadata.loading || !items.length} onClick={genreMetadata.checkMore}>{genreMetadata.enabled ? "Carregar mais gêneros" : "Retomar gêneros"}</Button>
        {genreMetadata.enabled && <Button size="sm" variant="ghost" onClick={genreMetadata.pause}>Pausar consulta</Button>}</div>
        {genreMetadata.error && <p role="alert" className="w-full text-amber-600">{genreMetadata.error}</p>}
      </div>}
    </>}
    {section === "games" ? <>
      {loadedGamesDay === day && <UniplayGameBannerDialog day={day} schedule={bannerSchedule} open={bannerOpen} onOpenChange={setBannerOpen} initialRegion={region === "world" ? "international" : "national"} />}
      <p className="text-xs text-muted-foreground">Agenda: ESPN · Transmissões no Brasil: <a href="https://ondeassistir.com.br/" target="_blank" rel="noopener noreferrer" className="underline">Onde Assistir</a> e <a href="https://futebol.tv.br/" target="_blank" rel="noopener noreferrer" className="underline">Futebol na TV</a> · Horários de Brasília. Principais jogos reúne grandes clubes e competições. A disponibilidade dos canais depende do seu pacote Uniplay.</p>
      {partial && <p role="status" className="text-sm text-amber-600">Parte da agenda está indisponível. Alguns jogos podem não aparecer.</p>}
      {broadcastsUnavailable && <p role="status" className="text-sm text-amber-600">O guia de transmissões está indisponível. Os canais serão exibidos quando a consulta voltar a funcionar.</p>}
      {gamesError && <p role="alert" className="text-sm text-destructive">{gamesError}</p>}
      {gamesLoading ? <Loading /> : !gamesError && <>
        <p className="text-xs text-muted-foreground">{visibleMatches.length} jogo(s)</p>
        {!visibleMatches.length && <Empty text={gamesScope === "featured" ? "Nenhum destaque encontrado para essa data e filtros. Selecione Todos os jogos para ver a agenda completa." : "Nenhum jogo encontrado para essa data e filtros na fonte consultada."} />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleMatches.map(m => <article key={m.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5 shrink-0" />{m.competition}</span><Badge variant="outline">{m.brazil ? "Brasil" : "Internacional"}</Badge></div>
          <p className="text-sm font-medium">{m.home} <span className="text-muted-foreground">{m.state === "pre" ? "×" : `${m.homeScore} × ${m.awayScore}`}</span> {m.away}</p>
          <div className="flex items-center justify-between text-sm"><time dateTime={m.date}>{new Date(m.date).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</time>
            <Badge variant={m.state === "in" ? "default" : "secondary"}>{m.status}</Badge></div>
          <div className="space-y-2 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium"><Tv className="h-3.5 w-3.5" />Onde assistir no Brasil</p>
            {m.channels.length ? <div className="flex flex-wrap gap-1.5">{m.channels.map(channel => <Badge key={channel} variant="secondary">{channel}</Badge>)}</div>
              : <p className="text-xs text-muted-foreground">{broadcastsUnavailable ? "Guia temporariamente indisponível" : "Transmissão a confirmar"}</p>}
            {m.broadcastSource && <a href={m.broadcastSource} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-muted-foreground underline">Consultar transmissão</a>}
          </div>
        </article>)}</div>
      </>}
    </> : <>
      {section === "recent" && <p className="text-xs text-muted-foreground">Adicionados da semana: inclusões nos últimos 7 dias, das mais recentes para as mais antigas. Quando a Uniplay não informa a data, acompanhamos os títulos que aparecerem após a primeira sincronização{baselineAt ? ` (${dateLabel(baselineAt)})` : ""}, com histórico sincronizado pela sua conta.</p>}
      {section === "releases" && <p className="text-xs text-muted-foreground">{seasonMode ? "Temporadas que estrearam nos últimos 6 meses de séries presentes no catálogo. O guia público identifica a estreia; a disponibilidade dessa temporada na Uniplay precisa ser conferida no aplicativo quando o painel não a informa." : "Estreias dos últimos 6 meses disponíveis no catálogo. Quando só há o ano de lançamento, mostramos apenas o ano atual. Adições e atualizações no catálogo não contam como estreia."}</p>}
      {seasonMode && seasonGuide.loading && <p role="status" className="text-sm text-muted-foreground">Consultando o guia de estreias de temporadas…</p>}
      {seasonMode && seasonGuide.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-amber-600">{seasonGuide.error}<Button size="sm" variant="outline" onClick={seasonGuide.retry}>Tentar novamente</Button></div>}
      {syncWarning && <p role="status" className="text-sm text-amber-600">N?o foi poss?vel sincronizar o hist?rico pela conta. Exibindo o acompanhamento dispon?vel neste navegador; clique em Atualizar para tentar novamente.</p>}
      {storageWarning && <p role="status" className="text-sm text-amber-600">Não foi possível salvar o acompanhamento neste navegador. Novidades sem data podem não ser preservadas ao sair.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}{syncedAt ? " Exibindo a última consulta." : ""}</p>}
      {loading && !syncedAt ? <Loading /> : <>
        <p className="text-xs text-muted-foreground">{filtered.length} título(s){syncedAt ? ` · Atualizado às ${new Date(syncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        {!filtered.length && !error && !(seasonMode && (seasonGuide.loading || seasonGuide.error)) && <Empty text={section === "recent" ? "Nenhuma inclusão identificada nos últimos 7 dias para esses filtros. Consulte o catálogo completo ou clique em Atualizar para verificar novas inclusões." : section === "releases" ? kind === "seasons" ? "Nenhuma estreia de temporada identificada para essas séries e filtros. A correspondência precisa ter título e ano compatíveis; isso não significa que não existam atualizações no aplicativo." : "Nenhum lançamento recente com ano ou data de estreia informado para esses filtros. Títulos antigos adicionados agora ficam em Recém-adicionados." : "Nenhum título encontrado."} />}
        {pageControls("acima")}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{paginated.items.map(item => <article key={item.key} className="overflow-hidden rounded-lg border bg-card">
          <div className="relative aspect-[2/3] bg-muted"><div className="absolute inset-0 flex items-center justify-center"><Clapperboard className="h-10 w-10 text-muted-foreground/40" /></div>
            {item.image && <img className="relative h-full w-full object-cover" src={item.image} alt={`Capa de ${item.name}`} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}</div>
          <div className="space-y-2 p-3"><Badge variant="secondary">{item.kind === "movie" ? "Filme" : "Série"}</Badge><h3 className="text-sm font-medium leading-snug">{item.name}</h3>
            {(item.audioLabel || item.qualities.length > 0) && <div className="flex flex-wrap gap-1">{item.audioLabel && <Badge variant="secondary">{item.audioLabel}</Badge>}{item.qualities.map(quality => <Badge variant="outline" key={quality}>{quality}</Badge>)}</div>}
            {section === "releases" && <><Badge variant="outline">{seasonMode ? "Série no catálogo" : "No catálogo"}</Badge><p className="text-xs font-medium text-primary">{releaseNews.get(item.key)?.label}</p></>}
            {seasonMode && seasonNews.get(item.key)?.providerConfirmed === false && <><Badge variant="outline">Temporada a conferir no app</Badge><p className="text-xs text-muted-foreground">Estreia: {new Date(seasonNews.get(item.key)!.order).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p><a className="text-xs text-muted-foreground underline" href={seasonNews.get(item.key)?.source} target="_blank" rel="noopener noreferrer">Fonte da estreia</a></>}
            {!!item.genres?.length && <div className="flex flex-wrap gap-1">{item.genres.map(name => <Badge variant="outline" key={name}>{name}</Badge>)}{item.genreSource && <a className="text-xs text-muted-foreground underline" href={item.genreSource} target="_blank" rel="noopener noreferrer" aria-label={`Consultar fonte dos gêneros de ${item.name}`}>Fonte</a>}</div>}
            {item.kind === "series" && item.latestSeason && <p className="text-xs text-muted-foreground">Até a {item.latestSeason}ª temporada</p>}
            {item.kind === "series" && item.episodeCount && <p className="text-xs text-muted-foreground">{item.episodeCount} episódios</p>}
            {section === "recent" && (item.addedAt || item.observedAt) && <p className="text-xs text-muted-foreground">{item.addedAt ? "Adicionado" : "Identificado"} em {dateLabel((item.addedAt ?? item.observedAt)!)}</p>}
            {section === "releases" && (!seasonMode || seasonNews.get(item.key)?.providerConfirmed) && (releaseNews.get(item.key)?.label.startsWith("Nova temporada") ? item.seasonReleasedAt && <p className="text-xs text-muted-foreground">Estreia da temporada: {dateLabel(item.seasonReleasedAt)}</p> : item.releasedAt && <p className="text-xs text-muted-foreground">Lançamento: {dateLabel(item.releasedAt)}</p>)}
          </div></article>)}</div>
        {pageControls("abaixo")}
      </>}
    </>}
    </>}
  </section>;
}

function Loading() { return <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</p>; }
