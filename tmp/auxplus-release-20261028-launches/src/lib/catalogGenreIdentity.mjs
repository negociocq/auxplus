export const normalizeGenreTitle = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function genreIdentity(title) {
  const original = String(title.name || "").trim();
  const withoutQuality = original.replace(/(?:\s+(?:4k|uhd|fhd|hd|leg|legendado|dub|dublado))+\s*$/gi, "").trim();
  const yearMatch = withoutQuality.match(/[([]((?:19|20)\d{2})[)\]]/) || withoutQuality.match(/\s((?:19|20)\d{2})\s*$/);
  const year = Number(title.releaseYear || yearMatch?.[1]) || undefined;
  let name = withoutQuality;
  if (yearMatch) name = name.replace(yearMatch[0], " ").trim();
  name = name.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, "").replace(/\s+/g, " ").trim();
  return { name, year, kind: title.kind, key: `${title.kind}|${year || ""}|${normalizeGenreTitle(name)}` };
}

export function genreTitleVariants(name) {
  const lowerWords = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em", "no", "nos", "na", "nas", "the", "of", "and", "in"]);
  const words = name.toLocaleLowerCase("pt-BR").split(" ");
  const titleCase = words.map((word, i) => i && lowerWords.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  const capitalized = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return [...new Set([name, titleCase, capitalized])];
}

const translations = {
  "action": ["Ação"], "adventure": ["Aventura"], "comedy": ["Comédia"], "comedy film": ["Comédia"],
  "action film": ["Ação"], "adventure film": ["Aventura"], "drama film": ["Drama"], "crime film": ["Crime"],
  "crime drama": ["Crime", "Drama"], "comedy drama": ["Comédia", "Drama"], "gangster film": ["Crime"],
  "horror film": ["Terror"], "horror": ["Terror"], "science fiction": ["Ficção científica"],
  "science fiction film": ["Ficção científica"], "sci fi": ["Ficção científica"], "fantasy film": ["Fantasia"],
  "fantasy": ["Fantasia"], "animated film": ["Animação"], "animated series": ["Animação"], "animation": ["Animação"],
  "animated sitcom": ["Animação", "Comédia"], "sitcom": ["Comédia"], "documentary film": ["Documentário"],
  "documentary": ["Documentário"], "romantic comedy": ["Comédia", "Romance"], "romance film": ["Romance"],
  "superhero film": ["Super-heróis"], "spy film": ["Espionagem"], "western film": ["Faroeste"], "western": ["Faroeste"],
  "war film": ["Guerra"], "musical film": ["Musical"], "biographical film": ["Biografia"], "psychological thriller": ["Suspense"],
  "family film": ["Família"], "family": ["Família"], "mystery film": ["Mistério"], "mystery": ["Mistério"],
  "romantic drama film": ["Romance", "Drama"], "psychological drama film": ["Drama"], "historical drama": ["História", "Drama"],
  "reality television": ["Reality show"], "reality tv": ["Reality show"], "anime": ["Anime"],
  "filme de acao": ["Ação"], "acao": ["Ação"], "filme de aventura": ["Aventura"], "aventura": ["Aventura"],
  "filme de comedia": ["Comédia"], "comedia": ["Comédia"], "comedia dramatica": ["Comédia", "Drama"],
  "filme de drama": ["Drama"], "drama": ["Drama"], "drama policial": ["Crime", "Drama"], "filme policial": ["Crime"],
  "filme de terror": ["Terror"], "terror": ["Terror"], "filme de suspense": ["Suspense"], "suspense": ["Suspense"], "thriller": ["Suspense"],
  "filme de ficcao cientifica": ["Ficção científica"], "ficcao cientifica": ["Ficção científica"],
  "filme de fantasia": ["Fantasia"], "fantasia": ["Fantasia"], "filme de animacao": ["Animação"], "animacao": ["Animação"],
  "animacao comedia": ["Animação", "Comédia"], "comedia de animacao": ["Animação", "Comédia"],
  "filme documentario": ["Documentário"], "documentario": ["Documentário"], "filme romantico": ["Romance"], "romance": ["Romance"],
  "comedia romantica": ["Comédia", "Romance"], "filme de super heroi": ["Super-heróis"], "filme de super herois": ["Super-heróis"],
  "filme de espionagem": ["Espionagem"], "filme de faroeste": ["Faroeste"], "faroeste": ["Faroeste"],
  "filme de guerra": ["Guerra"], "filme musical": ["Musical"], "musical": ["Musical"], "filme biografico": ["Biografia"],
};
export function translateSourceGenres(labels) {
  return [...new Set(labels.flatMap(label => translations[normalizeGenreTitle(label)] ||
    [label.replace(/^(?:filme|série|série de televisão)\s+(?:de\s+)?/i, "").replace(/^./u, c => c.toLocaleUpperCase("pt-BR"))]))].filter(Boolean);
}

/** An exact localized title, compatible year and correct media kind are all required. */
export function matchGenreEntity(identity, candidates, requireGenres = true) {
  const matches = candidates.filter(candidate => candidate.kind === identity.kind && (candidate.genres.length || !requireGenres && candidate.seasons?.length) &&
    candidate.names.some(name => normalizeGenreTitle(name) === normalizeGenreTitle(identity.name)) &&
    (!identity.year || candidate.years.includes(identity.year)));
  const unique = [...new Map(matches.map(candidate => [candidate.id, candidate])).values()];
  return unique.length === 1 ? unique[0] : undefined;
}

/** Join a public guide locally; no private catalog is sent to the guide service. */
export function matchRecentSeasonGuide(titles, candidates, now = Date.now()) {
  const index = new Map();
  for (const candidate of candidates) for (const name of candidate.names || []) {
    const key = normalizeGenreTitle(name);
    if (!index.has(key)) index.set(key, new Map());
    index.get(key).set(candidate.id, candidate);
  }
  const references = {};
  for (const title of titles) {
    if (title.kind !== "series") continue;
    const identity = genreIdentity(title);
    const match = matchGenreEntity(identity, [...(index.get(normalizeGenreTitle(identity.name))?.values() || [])], false);
    const season = match?.seasons?.filter(season => season.number > 1 && season.releasedAt <= now && season.releasedAt >= now - 183 * 86400000)
      .sort((a, b) => b.releasedAt - a.releasedAt || b.number - a.number)[0];
    if (season) references[title.key] = { number: season.number, releasedAt: season.releasedAt, source: `https://www.wikidata.org/wiki/${season.id}` };
  }
  return references;
}

export function matchPublicGenreGuide(titles, candidates) {
  const index = new Map();
  for (const candidate of candidates) for (const name of candidate.names || []) {
    const key = `${candidate.kind}|${normalizeGenreTitle(name)}`;
    if (!index.has(key)) index.set(key, new Map());
    index.get(key).set(candidate.id, candidate);
  }
  const matches = {};
  for (const title of titles) {
    if (title.genres?.length) continue;
    const identity = genreIdentity(title);
    if (!identity.year) continue;
    const candidates = [...(index.get(`${identity.kind}|${normalizeGenreTitle(identity.name)}`)?.values() || [])];
    const match = matchGenreEntity(identity, candidates);
    if (match) matches[identity.key] = { genres: match.genres, source: `https://www.wikidata.org/wiki/${match.id}`, checkedAt: Date.now(), metadataVersion: 3 };
  }
  return matches;
}
