import { catalogNews, type CatalogTitle } from "./uniplayDiscover.ts";
import { groupCatalogVariants, type CatalogDisplayTitle } from "./catalogBrowsing.ts";
import { catalogRecognitionKey, catalogRecognitionScore, catalogWithReleaseEvidence } from "./catalogPopularity.ts";

export type CatalogBannerPage = { kind: "movie" | "series"; page: number; total: number; titles: CatalogDisplayTitle[] };
export function catalogBannerPages(items: CatalogTitle[], pagesPerKind = 1, used: string[] = [], now = Date.now()): CatalogBannerPage[] {
  const seen = new Set(used), max = Math.max(1, Math.min(3, Math.trunc(pagesPerKind) || 1));
  const all = groupCatalogVariants(items.map(catalogWithReleaseEvidence));
  const news = new Map(all.map(item => [item.key, catalogNews(item, now)]));
  const recognition = new Map(all.map(item => [item.key, catalogRecognitionScore(item)]));
  const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now));
  const unique = new Set<string>();
  const recent = (date?: number) => !!date && date <= now && now - date <= 120 * 86400000;
  const grouped = all.filter(item => !!news.get(item.key)
    && (recent(item.releasedAt) || item.kind === 'series' && recent(item.seasonReleasedAt))
    && recognition.get(item.key)! > 0 && (!item.rating || item.rating >= 6)
    && !seen.has(item.key) && !seen.has(catalogRecognitionKey(item))
    && (!item.releasedAt || item.releasedAt <= now) && (!item.releaseYear || item.releaseYear <= year))
    // Recent release windows come first; recognition chooses the stronger titles
    // within the same window. A catalog addition never makes an old work new.
    .sort((a, b) => Math.floor(news.get(b.key)!.order / (30 * 86400000)) - Math.floor(news.get(a.key)!.order / (30 * 86400000))
      || recognition.get(b.key)! - recognition.get(a.key)! || (b.rating || 0) - (a.rating || 0)
      || news.get(b.key)!.order - news.get(a.key)!.order || Number(!!b.releaseYear) - Number(!!a.releaseYear)
      || a.name.localeCompare(b.name, "pt-BR"))
    .filter(item => { const key = catalogRecognitionKey(item); if (unique.has(key)) return false; unique.add(key); return true; });
  const result: CatalogBannerPage[] = [];
  for (const kind of ["movie", "series"] as const) {
    const selected = grouped.filter(item => item.kind === kind).slice(0, max * 4), total = Math.ceil(selected.length / 4);
    for (let page = 0; page < total; page++) result.push({ kind, page, total, titles: selected.slice(page * 4, page * 4 + 4) });
  }
  return result;
}
const xml = (value: unknown) => String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));
function lines(text: string, width: number, limit: number) {
  const result: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) { if (line && (line + " " + word).length > width) { result.push(line); line = word; } else line += `${line ? " " : ""}${word}`; }
  if (line) result.push(line);
  if (result.length > limit) { result.length = limit; result[limit - 1] = result[limit - 1].slice(0, width - 1) + "…"; }
  return result;
}
/** The browser and server share this deterministic layout and use real catalog covers. */
export function catalogBannerSvg(banner: CatalogBannerPage, posters: Record<string, string> = {}) {
  const color = banner.kind === "movie" ? "#18e1d4" : "#c4a0ff";
  const cards = banner.titles.map((title, i) => {
    const x = 54 + (i % 2) * 496, y = 325 + Math.floor(i / 2) * 640, clip = `poster-${i}`;
    const image = posters[title.key];
    const name = title.name.replace(/\s*\(\d{4}\)$/, "");
    const seasonNews = catalogNews(title)?.label.startsWith("Nova temporada");
    const releaseLabel = seasonNews ? `Nova temporada${title.latestSeason ? ` · ${title.latestSeason}ª` : ""}` : title.releaseYear;
    if (banner.titles.length === 1) {
      return `<defs><clipPath id="${clip}"><rect x="160" y="325" width="760" height="1070" rx="20"/></clipPath></defs>
        <rect x="160" y="325" width="760" height="1240" rx="22" fill="#0b2430" stroke="${color}" stroke-width="2"/>
        ${image ? `<image href="${xml(image)}" x="160" y="325" width="760" height="1070" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>` : `<text x="540" y="800" text-anchor="middle" fill="#95b5bb" font-size="48">AUXPLUS</text>`}
        ${lines(name, 32, 2).map((line,n)=>`<text x="184" y="${1438+n*42}" fill="white" font-size="36" font-weight="700">${xml(line)}</text>`).join('')}
        <text x="184" y="1535" fill="#b8cbd1" font-size="27">${xml(releaseLabel)}</text>
        <text x="896" y="1535" text-anchor="end" fill="${color}" font-size="27" font-weight="700">${xml(title.audioLabel)}</text>`;
    }
    return `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="476" height="490" rx="20"/></clipPath></defs>
      <rect x="${x}" y="${y}" width="476" height="612" rx="22" fill="#0b2430" stroke="${color}" stroke-width="2"/>
      ${image ? `<image href="${xml(image)}" x="${x}" y="${y}" width="476" height="490" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>` : `<text x="${x + 238}" y="${y + 250}" text-anchor="middle" fill="#95b5bb" font-size="32">AUXPLUS</text>`}
      ${lines(name, 28, 2).map((line, n) => `<text x="${x + 18}" y="${y + 522 + n * 32}" fill="white" font-size="27" font-weight="700">${xml(line)}</text>`).join("")}
      <text x="${x + 18}" y="${y + 590}" fill="#b8cbd1" font-size="23">${xml(releaseLabel)}</text>
      <text x="${x + 455}" y="${y + 590}" text-anchor="end" fill="${color}" font-size="23" font-weight="700">${xml([title.audioLabel, ...title.qualities.filter(q => ["4K", "UHD"].includes(q))].filter(Boolean).join(" · "))}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#06121f"/><stop offset="1" stop-color="#07383b"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <g font-family="Roboto,Arial,sans-serif"><text x="540" y="105" text-anchor="middle" fill="${color}" font-size="52" font-weight="700">AUXPLUS</text>
    <text x="540" y="200" text-anchor="middle" fill="white" font-size="66" font-weight="700">LANÇAMENTOS</text>
    <text x="540" y="258" text-anchor="middle" fill="${color}" font-size="34" letter-spacing="8">${banner.kind === "movie" ? "FILMES" : "SÉRIES"}</text>
    <text x="540" y="297" text-anchor="middle" fill="#b8cbd1" font-size="25">Disponíveis no catálogo · ${banner.page + 1}/${banner.total}</text>
    ${cards}
    <rect x="55" y="1645" width="970" height="170" rx="28" fill="#0a4148" stroke="${color}" stroke-width="2"/>
    <text x="540" y="1715" text-anchor="middle" fill="white" font-size="49" font-weight="700">Comente “teste”</text>
    <text x="540" y="1770" text-anchor="middle" fill="#d6eeee" font-size="40">para testar grátis.</text>
    <text x="540" y="1885" text-anchor="middle" fill="${color}" font-size="30" font-weight="700">AUXPLUS</text></g></svg>`;
}
