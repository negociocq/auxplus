import { useEffect, useMemo, useState } from "react";
import type { CatalogTitle } from "@/lib/uniplayDiscover";
import { matchRecentSeasonGuide } from "@/lib/catalogGenreIdentity.mjs";

let cached: { candidates: unknown[]; expires: number } | undefined;
let pending: Promise<unknown[]> | undefined;
async function loadGuide() {
  if (cached && cached.expires > Date.now()) return cached.candidates;
  if (!pending) pending = fetch("/api/recent-seasons", { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw new Error("Não foi possível consultar as estreias de temporadas. Tente novamente.");
    const data = await response.json();
    if (!Array.isArray(data.candidates)) throw new Error("O guia de temporadas retornou uma resposta inválida.");
    cached = { candidates: data.candidates, expires: Date.now() + 3600000 };
    return data.candidates;
  }).finally(() => { pending = undefined; });
  return pending;
}

export function useRecentSeasons<T extends CatalogTitle>(items: T[], enabled: boolean) {
  const [candidates, setCandidates] = useState<unknown[]>(cached?.candidates || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError("");
    // The request contains no catalog titles: matching this public guide happens locally.
    void loadGuide().then(data => { if (!cancelled) setCandidates(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao consultar temporadas."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, refresh]);
  const titles = useMemo(() => {
    if (!enabled || !candidates.length) return items;
    const references = matchRecentSeasonGuide(items, candidates);
    return items.map(item => references[item.key] ? { ...item, seasonReference: references[item.key] } : item);
  }, [items, candidates, enabled]);
  return { titles, loading, error, retry: () => { cached = undefined; setRefresh(value => value + 1); } };
}
