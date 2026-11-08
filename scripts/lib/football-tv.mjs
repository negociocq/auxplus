const SOURCE = "https://futebol.tv.br";
let cached;
let pending;
const decode = text => text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();

export function parseFootballTv(html) {
  const fixtures = new Map();
  for (const article of html.matchAll(/<article\b[^>]*class="fixture-row\b[^\"]*"[^>]*>([\s\S]*?)<\/article>/g)) {
    const content = article[1];
    const title = content.match(/aria-label="Ver detalhes de ([^"]+)"/)?.[1];
    const date = content.match(/<time\b[^>]*datetime="([^"]+)"/)?.[1];
    const url = content.match(/href="(https:\/\/futebol\.tv\.br\/jogo\/[^\"]+)"/)?.[1];
    const teams = title && decode(title).split(/\s+[x×]\s+/i);
    if (!teams || teams.length !== 2 || !date || !Number.isFinite(Date.parse(date)) || !url) continue;
    const channels = [...content.matchAll(/<span\b[^>]*class="channel-pill\b[^\"]*"[^>]*>(?:\s*<span[^>]*>[\s\S]*?<\/span>)?([^<]+)<\/span>/g)]
      .map(m => decode(m[1])).filter(s => s && !/confirmar|n[aã]o informad/i.test(s));
    if (channels.length) fixtures.set(url, { home: teams[0], away: teams[1], date, channels: [...new Set(channels)], url });
  }
  return [...fixtures.values()];
}

export async function getFootballTvGuide() {
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending) return pending;
  pending = (async () => {
    const results = await Promise.allSettled(["", "jogos-de-amanha"].map(async path => {
      const response = await fetch(`${SOURCE}/${path}`, { signal: AbortSignal.timeout(12000), headers: { accept: "text/html", "user-agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`Guia de TV indisponível (${response.status})`);
      const fixtures = parseFootballTv(await response.text());
      if (!fixtures.length) throw new Error("O guia não retornou transmissões reconhecidas.");
      return fixtures;
    }));
    const successful = results.filter(r => r.status === "fulfilled");
    if (!successful.length) throw new Error("Não foi possível consultar o guia de transmissões.");
    const data = { fixtures: [...new Map(successful.flatMap(r => r.value).map(f => [f.url, f])).values()], partial: successful.length < results.length };
    cached = { data, expires: Date.now() + 300000 };
    return data;
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function footballTvHandler(req, res) {
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const data = await getFootballTvGuide();
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");
    res.end(JSON.stringify(data));
  } catch {
    res.statusCode = 502; res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "Guia complementar de transmissões indisponível." }));
  }
}
