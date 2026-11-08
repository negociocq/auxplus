import { catalogGenres } from "./catalogBrowsing.ts";
import { shortSynopsis } from "./catalogSynopsis.ts";

export type CatalogTitle = {
  key: string; name: string; kind: "movie" | "series"; image?: string; genres?: string[]; genreSource?: string;
  synopsis?: string; synopsisSource?: string;
  addedAt?: number; releasedAt?: number; observedAt?: number;
  releaseYear?: number; updatedAt?: number; latestSeason?: number; episodeCount?: number;
  voteCount?: number;
  rating?: number;
  seasonAddedAt?: number; episodesAddedAt?: number; featuredRelease?: boolean;
  seasonReleasedAt?: number; seasonReleaseYear?: number;
  seasonReference?: { number: number; releasedAt: number; source: string };
};
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const value = (r: Row, keys: string[]) => keys.map(k => r[k]).find(v => v !== undefined && v !== null && v !== "");

export function catalogDate(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return;
  const text = String(input).trim();
  // A year alone cannot establish the release day or the order within a year.
  if (/^\d{4}$/.test(text)) return;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const date = new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12));
    return date.getUTCFullYear() === Number(br[3]) && date.getUTCMonth() === Number(br[2]) - 1 && date.getUTCDate() === Number(br[1]) ? date.getTime() : undefined;
  }
  const n = /^\d{10}(?:\d{3})?$/.test(text) ? Number(text) * (text.length === 10 ? 1000 : 1)
    : /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T12:00:00Z`)
    : /^\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(text.replace(" ", "T")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function normalizeCatalog(data: { movies: unknown[]; series: unknown[] }): CatalogTitle[] {
  const titles = new Map<string, CatalogTitle>();
  for (const kind of ["movie", "series"] as const) {
    for (const input of kind === "movie" ? data.movies : data.series) {
      const r = row(input), info = row(r.info);
      const field = (keys: string[]) => value(r, keys) ?? value(info, keys);
      const name = String(value(r, ["name", "title"]) || "").trim();
      if (!name) continue;
      const key = `${kind}:${value(r, ["stream_id", "series_id", "id"]) ?? name}`;
      const image = String(value(r, ["thumb", "cover", "stream_icon", "poster"]) || "");
      const release = field(["release_date", "releaseDate", "releasedate", "first_air_date", "premiere_date"]);
      const releasedAt = catalogDate(release);
      const titleYear = name.match(/[([]((?:19|20)\d{2})[)\]]/)?.[1] || name.match(/\s((?:19|20)\d{2})\s*$/)?.[1];
      const year = Number(field(["release_year", "year", "ano"]) || (releasedAt ? new Date(releasedAt).getUTCFullYear() : /^\d{4}$/.test(String(release || "")) ? release : titleYear));
      const positive = (v: unknown) => Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined;
      const seasonName = name.match(/\b(?:temporada|season|T|S)\s*[.:-]?\s*(\d{1,3})\b/i)?.[1] || name.match(/\b(\d{1,3})[ªºa]?\s*(?:temporada|season)\b/i)?.[1];
      const seasonList = field(["seasons"]);
      const seasonNumbers = Array.isArray(seasonList) ? seasonList.map(s => positive(row(s).season_number)).filter((n): n is number => !!n) : [];
      const episodes = field(["episodes"]);
      const episodeSeasons = Object.keys(row(episodes)).filter(k => /^\d+$/.test(k) && Number(k) > 0 && Array.isArray(row(episodes)[k])).map(Number);
      const latestSeason = positive(field(["season_number", "latest_season", "seasons_count", "season_count", "num_seasons"])) || (seasonNumbers.length ? Math.max(...seasonNumbers) : episodeSeasons.length ? Math.max(...episodeSeasons) : positive(seasonName));
      const episodeCount = positive(field(["episode_count", "episodes_count", "num_episodes"])) || (Array.isArray(episodes) ? positive(episodes.length) : episodeSeasons.length ? positive(episodeSeasons.reduce((sum, season) => sum + (row(episodes)[String(season)] as unknown[]).length, 0)) : undefined);
      const latestSeasonInfo = Array.isArray(seasonList) ? seasonList.map(row).find(s => Number(s.season_number) === latestSeason) : undefined;
      const seasonRelease = field(["latest_season_release_date", "season_release_date", "season_air_date"]) ?? value(latestSeasonInfo || {}, ["air_date", "release_date"]);
      const seasonReleasedAt = catalogDate(seasonRelease);
      const seasonYear = Number(field(["latest_season_year", "season_year"]) || (seasonReleasedAt ? new Date(seasonReleasedAt).getUTCFullYear() : /^\d{4}$/.test(String(seasonRelease || "")) ? seasonRelease : NaN));
      const category = field(["category_name", "category", "categories"]);
      const categoryText = typeof category === "string" ? category : Array.isArray(category) ? category.map(c => typeof c === "string" ? c : String(row(c).name || "")).join(" ") : String(row(category).name || "");
      const synopsis=shortSynopsis(field(["plot", "overview", "sinopse", "synopsis", "description"]));
      titles.set(key, { key, name, kind, image: /^https?:\/\//i.test(image) ? image : undefined,
        synopsis: synopsis || undefined,
        synopsisSource: synopsis ? "Catálogo" : undefined,
        genres: catalogGenres(field(["genres", "genre", "generos", "genero"])),
        addedAt: catalogDate(value(r, ["added", "added_at", "created_at", "date_added"])),
        releasedAt, releaseYear: year >= 1900 && year <= 2100 ? year : undefined,
        voteCount: positive(field(["vote_count", "votes", "rating_count"])),
        rating: (() => { const n = Number(String(field(["vote_average", "rating", "imdb_rating"]) || "").replace(",", ".")); return n > 0 && n <= 10 ? n : undefined; })(),
        updatedAt: catalogDate(field(["last_modified", "updated_at", "modified", "last_update"])),
        latestSeason: kind === "series" ? latestSeason : undefined, episodeCount: kind === "series" ? episodeCount : undefined,
        seasonReleasedAt: kind === "series" ? seasonReleasedAt : undefined,
        seasonReleaseYear: kind === "series" && seasonYear >= 1900 && seasonYear <= 2100 ? seasonYear : undefined,
        featuredRelease: /lan[cç]amentos?|estreias?|novas? temporadas?/i.test(categoryText),
      });
    }
  }
  return [...titles.values()];
}

export type CatalogSnapshot = { version: 1; baselineAt: number; seen: Record<string, number>;
  series?: Record<string, { season?: number; episodes?: number; seasonAt?: number; episodesAt?: number }> };

export function parseCatalogSnapshot(input: unknown): CatalogSnapshot | null {
  try {
    const saved = typeof input === "string" ? JSON.parse(input) : input;
    if (saved?.version !== 1 || !Number.isFinite(saved.baselineAt) || saved.baselineAt <= 0 ||
      !saved.seen || typeof saved.seen !== "object" || Array.isArray(saved.seen)) return null;
    if (!Object.values(saved.seen).every(time => typeof time === "number" && Number.isFinite(time) && time >= saved.baselineAt)) return null;
    return saved as CatalogSnapshot;
  } catch { return null; }
}

/** Preserve first observations when localhost and production have different histories. */
export function mergeCatalogSnapshots(...inputs: (CatalogSnapshot | null | undefined)[]): CatalogSnapshot | null {
  const snapshots = inputs.map(parseCatalogSnapshot).filter((s): s is CatalogSnapshot => !!s);
  if (!snapshots.length) return null;
  const merged: CatalogSnapshot = { version: 1, baselineAt: Math.min(...snapshots.map(s => s.baselineAt)), seen: {}, series: {} };
  for (const snapshot of snapshots) {
    for (const [key, time] of Object.entries(snapshot.seen)) merged.seen[key] = Math.min(merged.seen[key] ?? time, time);
    for (const [key, state] of Object.entries(snapshot.series || {})) {
      if (!state || typeof state !== "object") continue;
      const old = merged.series![key];
      const positive = (n?: number) => typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
      const first = (a?: number, b?: number) => Math.min(positive(a) || Infinity, positive(b) || Infinity) || undefined;
      const seasonAt = first(old?.seasonAt, state.seasonAt), episodesAt = first(old?.episodesAt, state.episodesAt);
      merged.series![key] = { season: Math.max(positive(old?.season), positive(state.season)) || undefined,
        episodes: Math.max(positive(old?.episodes), positive(state.episodes)) || undefined,
        seasonAt: Number.isFinite(seasonAt) ? seasonAt : undefined,
        episodesAt: Number.isFinite(episodesAt) ? episodesAt : undefined };
    }
  }
  return merged;
}

export function observeCatalog(titles: CatalogTitle[], previous: CatalogSnapshot | null, now: number) {
  const snapshot: CatalogSnapshot = { version: 1, baselineAt: previous?.baselineAt ?? now, seen: { ...previous?.seen }, series: { ...previous?.series } };
  const items = titles.map(title => {
    const saved = previous?.seen[title.key];
    const firstSeen = typeof saved === "number" && Number.isFinite(saved) ? saved : now;
    snapshot.seen[title.key] = firstSeen;
    const old = previous?.series?.[title.key];
    const seasonAt = old?.season && title.latestSeason && title.latestSeason > old.season ? now : old?.seasonAt;
    const episodesAt = old?.episodes && title.episodeCount && title.episodeCount > old.episodes ? now : old?.episodesAt;
    if (title.kind === "series") snapshot.series![title.key] = {
      season: Math.max(title.latestSeason || 0, old?.season || 0) || undefined,
      episodes: Math.max(title.episodeCount || 0, old?.episodes || 0) || undefined, seasonAt, episodesAt,
    };
    return { ...title, observedAt: firstSeen > snapshot.baselineAt ? firstSeen : undefined,
      seasonAddedAt: title.latestSeason && title.latestSeason >= (snapshot.series?.[title.key]?.season || 0) ? seasonAt : undefined,
      episodesAddedAt: title.episodeCount && title.episodeCount >= (snapshot.series?.[title.key]?.episodes || 0) ? episodesAt : undefined };
  });
  return { items, snapshot };
}

/** Actual release evidence only. Catalog additions, observed changes and tags are not premieres. */
export function catalogNews(title: CatalogTitle, now = Date.now()): { label: string; order: number } | undefined {
  const recent = (date?: number) => !!date && date <= now && date >= now - 183 * 86400000;
  const year = Number(brasiliaDay(new Date(now)).slice(0, 4));
  if (title.kind === "series" && recent(title.seasonReleasedAt)) return { label: `Nova temporada${title.latestSeason ? ` · ${title.latestSeason}ª` : ""}`, order: title.seasonReleasedAt! };
  if (title.kind === "series" && !title.seasonReleasedAt && title.seasonReleaseYear === year) return { label: `Nova temporada${title.latestSeason ? ` · ${title.latestSeason}ª` : ""} · ${year}`, order: Date.UTC(year, 0, 1) };
  if (recent(title.releasedAt)) return { label: "Estreia recente informada pela Uniplay", order: title.releasedAt! };
  if (!title.releasedAt && title.releaseYear === year) return { label: `Ano de lançamento informado: ${year}`, order: Date.UTC(year, 0, 1) };
}

/** A source premiere never implies that the provider carries that particular season. */
export function catalogSeasonNews(title: CatalogTitle, now = Date.now()): { label: string; order: number; providerConfirmed: boolean; source?: string } | undefined {
  if (title.kind !== "series") return;
  const own = catalogNews(title, now);
  if (own?.label.startsWith("Nova temporada")) return { ...own, providerConfirmed: true };
  const reference = title.seasonReference;
  if (reference && reference.number > 1 && reference.releasedAt <= now && reference.releasedAt >= now - 183 * 86400000) {
    return { label: `Estreia da ${reference.number}ª temporada`, order: reference.releasedAt, providerConfirmed: false, source: reference.source };
  }
}

const brasiliaDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
export const brasiliaDay = (date = new Date()) => brasiliaDayFormatter.format(date);

export type FootballMatch = { id: string; date: string; home: string; away: string; homeScore: string;
  awayScore: string; state: string; status: string; competition: string; brazil: boolean;
  highlight: boolean; channels: string[]; broadcastSource?: string; homeLogo?: string; awayLogo?: string };

const womenTeam = (name: string) => /women|feminin|feminino|feminina/i.test(name);
const normalizeTeam = (name: string) => {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(feminino|feminina|women|feminin|fc|afc)\b/g, "").replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = { bayernmunich: "bayern", bayernmunchen: "bayern", bayerndemunique: "bayern",
    acmilan: "milan", interdemilao: "internazionale", intermilan: "internazionale", inter: "internazionale",
    tottenhamhotspur: "tottenham", brightonhovealbion: "brighton", mancity: "manchestercity", manunited: "manchesterunited",
    athleticbilbao: "athleticclub", parisstgermain: "parissaintgermain", psg: "parissaintgermain",
    "1magdeburg": "magdeburg" };
  return aliases[normalized] || normalized;
};

/** Complement only unfilled channels with a dated, timed fixture from a second Brazilian guide. */
export function attachSupplementalBroadcasts(matches: FootballMatch[], guide: unknown): FootballMatch[] {
  const fixtures = row(guide).fixtures;
  if (!Array.isArray(fixtures)) return matches;
  return matches.map(match => {
    if (match.channels.length) return match;
    const fixture = fixtures.map(row).find(f => {
      const home = String(f.home || ""), away = String(f.away || "");
      const date = Date.parse(String(f.date));
      const url = String(f.url || "");
      return /^https:\/\/futebol\.tv\.br\/jogo\//.test(url) && Number.isFinite(date)
        && Math.abs(date - Date.parse(match.date)) <= 15 * 60000
        && womenTeam(`${home} ${away}`) === womenTeam(match.competition)
        && normalizeTeam(home) === normalizeTeam(match.home) && normalizeTeam(away) === normalizeTeam(match.away);
    });
    const channels = fixture && Array.isArray(fixture.channels) ? fixture.channels.filter((c): c is string => typeof c === "string" && !!c.trim() && !/confirmar|n[aã]o informad/i.test(c)) : [];
    return fixture && channels.length ? { ...match, channels: [...new Set(channels)], broadcastSource: String(fixture.url) } : match;
  });
}

/** Editorial selection, not an audience ranking. */
export function isFeaturedMatch(home: string, away: string, competition: string) {
  if (/\bu[ -]?\d{2}\b|sub[ -]?\d{2}|youth|reserve/i.test(competition)) return false;
  return /brasileir|brazilian serie [ab]|copa do brasil|copa do brazil|libertadores|sudamericana|sul-americana|uefa champions|uefa europa|premier league|la\s?liga|serie a|bundesliga|ligue 1|world cup|copa do mundo/i.test(competition)
    || /flamengo|palmeiras|corinthians|sao paulo|santos|botafogo|fluminense|vasco|gremio|internacional|cruzeiro|atletico.?m|real madrid|barcelona|atletico madrid|manchester|liverpool|arsenal|chelsea|tottenham|bayern|dortmund|juventus|milan|napoli|paris saint|al.?hilal|al.?nassr|boca juniors|river plate/i
      .test(`${home} ${away}`.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/** Match the dated fixture and both teams; never infer TV rights from the competition. */
export function attachBrazilBroadcasts(matches: FootballMatch[], feed: unknown): FootballMatch[] {
  const items = row(feed).items;
  if (!Array.isArray(items)) throw new Error("Guia de transmissões inválido.");
  return matches.map(match => {
    const candidates = items.map(row).filter(item => {
      const teams = String(item.title || "").replace(/:\s*onde assistir.*$/i, "").split(/\s+[x×]\s+/i);
      const stamp = String(item.content_text || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return teams.length === 2 && stamp && `${stamp[3]}-${stamp[2]}-${stamp[1]}` === brasiliaDay(new Date(match.date))
        && womenTeam(Array.isArray(item.tags) ? item.tags.join(" ") : "") === womenTeam(match.competition)
        && normalizeTeam(teams[0]) === normalizeTeam(match.home) && normalizeTeam(teams[1]) === normalizeTeam(match.away);
    }).sort((a, b) => (Date.parse(String(b.date_modified)) || 0) - (Date.parse(String(a.date_modified)) || 0));
    const item = candidates[0];
    if (!item) return match;
    const text = String(item.content_text || "").split(";").slice(1).join(";").trim().replace(/\.$/, "");
    const channels = !text || /a confirmar|n[aã]o informad|sem transmiss/i.test(text) ? [] : [...new Set(text.split(/,\s*/).map(s => s.trim()).filter(Boolean))];
    const url = String(item.url || "");
    return { ...match, channels, broadcastSource: /^https:\/\/ondeassistir\.com\.br\/jogo\//.test(url) ? url : undefined };
  });
}

function parseMatches(events: unknown[], brazil: boolean): FootballMatch[] {
  return events.flatMap(input => {
    const e = row(input), c = row(Array.isArray(e.competitions) ? e.competitions[0] : null);
    const teams = Array.isArray(c.competitors) ? c.competitors.map(row) : [];
    const home = teams.find(t => t.homeAway === "home"), away = teams.find(t => t.homeAway === "away");
    if (!home || !away || !e.id || !Number.isFinite(Date.parse(String(e.date)))) return [];
    const venue = row(row(c.venue).address);
    const status = row(row(e.status).type);
    const statusLabels: Record<string, string> = { STATUS_POSTPONED: "Adiado", STATUS_CANCELED: "Cancelado",
      STATUS_CANCELLED: "Cancelado", STATUS_SUSPENDED: "Suspenso", STATUS_DELAYED: "Atrasado" };
    const state = String(status.state || "pre");
    const homeName = String(row(home.team).displayName || "Mandante");
    const awayName = String(row(away.team).displayName || "Visitante");
    const competition = String(c.altGameNote || "Futebol");
    return [{ id: String(e.id), date: String(e.date), home: homeName,
      away: String(row(away.team).displayName || "Visitante"), homeScore: String(home.score ?? ""),
      awayScore: String(away.score ?? ""), state,
      status: statusLabels[String(status.name)] || (state === "in" ? "Ao vivo" : state === "post" ? "Encerrado" : "Programado"),
      competition, brazil: brazil || /^(Brazil|Brasil)$/i.test(String(venue.country)),
      highlight: isFeaturedMatch(homeName, awayName, competition), channels: [],
      homeLogo: typeof row(home.team).logo === "string" ? String(row(home.team).logo) : undefined,
      awayLogo: typeof row(away.team).logo === "string" ? String(row(away.team).logo) : undefined }];
  });
}

export async function getFootballMatches(day: string, signal?: AbortSignal, supplementalGuide?: unknown, requestHeaders?: HeadersInit) {
  const supplemental = (supplementalGuide ? Promise.resolve({ data: supplementalGuide, unavailable: false }) : fetch("/api/football-tv", { signal }).then(async response => {
    if (!response.ok) throw new Error("Guia complementar indisponível.");
    const data: unknown = await response.json();
    if (!Array.isArray(row(data).fixtures)) throw new Error("Guia complementar inválido.");
    return { data, unavailable: false };
  })).catch(() => ({ data: { fixtures: [] }, unavailable: true }));
  const broadcasts = fetch("https://ondeassistir.com.br/feed/jogos.json", { signal, headers: requestHeaders }).then(async response => {
    if (!response.ok) throw new Error("Guia de transmissões indisponível.");
    const data: unknown = await response.json();
    if (!Array.isArray(row(data).items)) throw new Error("Guia de transmissões inválido.");
    return { data, unavailable: false };
  }).catch(() => ({ data: { items: [] }, unavailable: true }));
  const tomorrow = new Date(`${day}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  // The all-leagues endpoint accepts individual days, not date ranges.
  const dates = [day.replace(/-/g, ""), brasiliaDay(tomorrow).replace(/-/g, "")];
  const leagues = ["all", "bra.1", "bra.2", "bra.copa_do_brazil"];
  const requests = dates.flatMap(date => leagues.map(league => ({ date, league })));
  const results = await Promise.allSettled(requests.map(async ({ date, league }) => {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${date}&limit=1000`, { signal, headers: requestHeaders });
    if (!response.ok) throw new Error(`Agenda indisponível (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.events)) throw new Error("Resposta da agenda inválida.");
    return parseMatches(data.events, league !== "all");
  }));
  if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
  const matches = new Map<string, FootballMatch>();
  let successes = 0;
  for (const result of results) if (result.status === "fulfilled") {
    successes++;
    for (const match of result.value) if (brasiliaDay(new Date(match.date)) === day) matches.set(match.id, match);
  }
  if (!successes) throw new Error("Não foi possível carregar a agenda. Tente atualizar em instantes.");
  const [guide, extra] = await Promise.all([broadcasts, supplemental]);
  if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
  return { matches: attachSupplementalBroadcasts(attachBrazilBroadcasts([...matches.values()], guide.data), extra.data).sort((a, b) => a.date.localeCompare(b.date)),
    partial: successes < requests.length, broadcastsUnavailable: guide.unavailable && extra.unavailable };
}
