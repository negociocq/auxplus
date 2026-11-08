import { useEffect, useMemo, useRef, useState } from "react";
import { catalogNews, catalogSeasonNews, type CatalogTitle } from "@/lib/uniplayDiscover";
import { genreIdentity, matchPublicGenreGuide } from "@/lib/catalogGenreIdentity.mjs";

type GenreEntry = { genres: string[]; source?: string; checkedAt: number; metadataVersion?: number };
type Entries = Record<string, GenreEntry>;
const KEY = "auxplus:genre-metadata:v3";
const PAUSE_KEY = "auxplus:public-genre-guide-paused:v1";
const MAX_AGE = 7 * 86400000;
const guides = new Map<string, { candidates: unknown[]; expires: number }>();
const pending = new Map<string, Promise<unknown[]>>();
let referenceRequest: Promise<unknown[]> | undefined;

async function loadInitialReference() {
  if (!referenceRequest) referenceRequest = fetch("/metadata/genre-reference-20261028.json").then(async response => {
    if (!response.ok) throw new Error("A referência inicial de gêneros não pôde ser carregada.");
    const data = await response.json();
    if (!Array.isArray(data.candidates)) throw new Error("Referência inicial de gêneros inválida.");
    return data.candidates;
  }).catch(error => { referenceRequest = undefined; throw error; });
  return referenceRequest;
}

function readEntries(): Entries {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("auxplus:genre-metadata:v2") || "{}");
    return Object.fromEntries(Object.entries(stored).filter(([, entry]) => {
      const value = entry as GenreEntry;
      return value && [2, 3].includes(value.metadataVersion) && Number.isFinite(value.checkedAt) && Date.now() - value.checkedAt < MAX_AGE &&
        Array.isArray(value.genres) && value.genres.length && value.genres.every(genre => typeof genre === "string");
    })) as Entries;
  } catch { return {}; }
}

async function loadGuide(kind: string, year: number) {
  const key = `${kind}:${year}`;
  if (guides.get(key)?.expires > Date.now()) return guides.get(key)!.candidates;
  if (pending.has(key)) return pending.get(key)!;
  // Only a public year and media type leave the browser, never the account's title list.
  const request = fetch(`/api/catalog-genre-guide?kind=${kind}&year=${year}`, { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw new Error("Não foi possível carregar parte do guia de gêneros. Clique em Carregar mais gêneros para tentar novamente.");
    const data = await response.json();
    if (!Array.isArray(data.candidates)) throw new Error("O guia de gêneros retornou uma resposta inválida.");
    guides.set(key, { candidates: data.candidates, expires: Date.now() + 86400000 });
    return data.candidates;
  }).finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

export function useCatalogGenres<T extends CatalogTitle>(items: T[], options: { section: string; kind: string; query: string; page: number }) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(PAUSE_KEY) !== "true"; } catch { return true; } });
  const [entries, setEntries] = useState<Entries>(readEntries);
  const latestEntries = useRef(entries); latestEntries.current = entries;
  const [loading, setLoading] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const { section, kind, query, page } = options;

  useEffect(() => {
    if (!items.length || ["games", "banners"].includes(section)) { setReferenceLoading(false); return; }
    let cancelled = false;
    setReferenceLoading(true);
    // This app asset is a generic public reference, independent of the visible filters.
    void loadInitialReference().then(candidates => {
      if (cancelled) return;
      const matches = matchPublicGenreGuide(items, candidates);
      const merged = { ...latestEntries.current, ...matches } as Entries;
      latestEntries.current = merged; setEntries(merged);
      try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(merged).slice(-6000)))); }
      catch { /* The static reference still fills the selector without browser storage. */ }
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Falha ao carregar referência de gêneros."); })
      .finally(() => { if (!cancelled) setReferenceLoading(false); });
    return () => { cancelled = true; };
  }, [items, section, round]);

  const scope = useMemo(() => {
    const now = Date.now(), since = now - 7 * 86400000, text = query.trim().toLocaleLowerCase("pt-BR");
    const news = new Map(items.map(item => [item.key, kind === "seasons" ? catalogSeasonNews(item, now) : catalogNews(item, now)]));
    return items.filter(item => (!text || item.name.toLocaleLowerCase("pt-BR").includes(text)) &&
      (kind === "all" || item.kind === kind || kind === "seasons" && item.kind === "series") &&
      (section === "recent" ? (item.addedAt ?? item.observedAt ?? 0) >= since && (item.addedAt ?? item.observedAt ?? 0) <= now :
        section === "releases" ? !!news.get(item.key) : true))
      .sort((a, b) => section === "recent" ? (b.addedAt ?? b.observedAt ?? 0) - (a.addedAt ?? a.observedAt ?? 0) :
        section === "releases" ? (news.get(b.key)?.order || 0) - (news.get(a.key)?.order || 0) || a.name.localeCompare(b.name, "pt-BR") : a.name.localeCompare(b.name, "pt-BR"));
  }, [items, section, kind, query]);

  useEffect(() => {
    if (!enabled || ["games", "banners"].includes(section)) { setLoading(false); return; }
    let cancelled = false, cursor = 0;
    const priority = scope.slice((page - 1) * 48, (page + 1) * 48);
    const combinations = new Map<string, { kind: string; year: number }>();
    for (const title of [...priority, ...(round ? scope : [])]) {
      const identity = genreIdentity(title);
      if (!identity.year || identity.year < 1900 || identity.year > 2100) continue;
      combinations.set(`${identity.kind}:${identity.year}`, { kind: identity.kind, year: identity.year });
      if (combinations.size >= 4 * (round + 1)) break;
    }
    const jobs = [...combinations.values()];
    setError(""); setLoading(jobs.length > 0);
    const worker = async () => {
      while (!cancelled && cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          const candidates = await loadGuide(job.kind, job.year);
          if (cancelled) return;
          const matches = matchPublicGenreGuide(items, candidates);
          const merged = { ...latestEntries.current, ...matches } as Entries;
          latestEntries.current = merged; setEntries(merged);
          try {
            const recent = Object.fromEntries(Object.entries(merged).sort(([, a], [, b]) => b.checkedAt - a.checkedAt).slice(0, 6000));
            localStorage.setItem(KEY, JSON.stringify(recent));
          } catch { /* In-memory matches remain available if browser storage is full. */ }
        } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao consultar gêneros."); }
      }
    };
    void Promise.all([worker(), worker()]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [items, scope, page, round, section, enabled]);

  const titles = useMemo(() => items.map(item => {
    const entry = entries[genreIdentity(item).key];
    return entry && !item.genres?.length ? { ...item, genres: entry.genres, genreSource: entry.source } : item;
  }), [items, entries]);
  const identified = useMemo(() => titles.filter(title => title.genres?.length).length, [titles]);
  const enable = () => {
    try { localStorage.removeItem(PAUSE_KEY); } catch { /* Resume still applies immediately. */ }
    setEnabled(true); setRound(value => value + 1);
  };
  const pause = () => {
    try { localStorage.setItem(PAUSE_KEY, "true"); } catch { /* Pause still applies immediately. */ }
    setEnabled(false);
  };
  return { titles, loading: loading || referenceLoading, error, identified, enabled, checkMore: enable, pause };
}
