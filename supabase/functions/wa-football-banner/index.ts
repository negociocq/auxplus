import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";
import { Buffer } from "node:buffer";
import { getFootballMatches } from "../../../src/lib/uniplayDiscover.ts";
import { bannerDays, bannerPages, drawFootballBanner, type BannerRegion } from "../../../src/lib/footballBanner.ts";
import { getFootballTvGuide } from "../../../scripts/lib/football-tv.mjs";
import { createFootballSvgCanvas, instagramFeedSvg, type SvgImage } from "../_shared/footballSvgCanvas.ts";

// Versioned public assets keep the deployment below the platform upload limit.
// Verify original bytes before using a remote font, background or WASM module.
async function renderAsset(file: string, hash: string) {
  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/football-renderer/v1/${file}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Renderer asset unavailable: ${file}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2,"0")).join("");
  if (actual !== hash) throw new Error(`Renderer asset checksum failed: ${file}`);
  return bytes;
}
const [wasm, font, boldFont, backdrop] = await Promise.all([
  renderAsset("resvg.wasm", "22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70"),
  renderAsset("Roboto.ttf", "d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134"),
  renderAsset("Roboto-Bold.ttf", "61f89f8db49261c2f6106e8dccc35df7b2f7ed909020db40a3fc905e95f99334"),
  renderAsset("stadium-night.png", "4f5a88aed919fa94b3848b3ba27287dbfc55953b5ba2b3e3a4a67b61700acdaa"),
]);
await initWasm(wasm);
const background: SvgImage = { naturalWidth: 1080, naturalHeight: 1920, data: `data:image/png;base64,${Buffer.from(backdrop).toString("base64")}` };
const cache = new Map<string, { expires: number; data: Awaited<ReturnType<typeof getFootballMatches>> }>();
const pending = new Map<string, Promise<Awaited<ReturnType<typeof getFootballMatches>>>>();
const pictures = new Map<string, { expires: number; data: Uint8Array }>();
async function schedule(day: string) {
  const cached = cache.get(day); if (cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(day)) return pending.get(day)!;
  const task = (async () => {
    const guide = await getFootballTvGuide().catch(() => ({ fixtures: [] }));
    const data = await getFootballMatches(day, AbortSignal.timeout(25000), guide, { "user-agent": "Mozilla/5.0", accept: "application/json" });
    if (data.partial) throw new Error("Agenda parcial.");
    for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
    cache.set(day, { expires: Date.now() + 300000, data }); return data;
  })();
  pending.set(day, task); try { return await task; } finally { pending.delete(day); }
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Use GET." }, 405);
  try {
    const query = new URL(req.url).searchParams, days = bannerDays();
    if (query.get("mode") === "health") return json({ ok: true, postDay: days[0] });
    if (query.get("mode") === "manifest") {
      const schedules = await Promise.all(days.map(schedule));
      const entries: { day: string; region: BannerRegion; page: number; total: number }[] = [];
      days.forEach((day, offset) => {
        for (const region of ["national", "international"] as const) {
          const pages = bannerPages(schedules[offset].matches, day, region);
          if (pages.length > 10) throw new Error("Número de páginas excedido.");
          pages.forEach((games, page) => { if (games.length) entries.push({ day, region, page, total: pages.length }); });
        }
      });
      return json({ postDay: days[0], entries });
    }
    const day = query.get("day") || days[0], region = query.get("region") || "national", page = Number(query.get("page") || "0");
    if (!days.includes(day) || !["national", "international"].includes(region) || !Number.isInteger(page) || page < 0 || page > 9) return json({ error: "Banner inválido." }, 400);
    const feed = query.get("format") === "instagram-feed";
    const key = `${day}:${region}:${page}:${days[0]}:${feed ? "feed" : "story"}`;
    for (const [k, v] of pictures) if (v.expires < Date.now()) pictures.delete(k);
    let png = pictures.get(key)?.data;
    if (!png) {
      const data = await schedule(day), pages = bannerPages(data.matches, day, region as BannerRegion), games = pages[page];
      if (!games?.length) return json({ error: "Nenhum jogo para esse banner." }, 404);
      const logos = new Map<string, SvgImage>();
      const urls = [...new Set(games.flatMap(g => [g.homeLogo, g.awayLogo]).filter((s): s is string => !!s && /^https:\/\/a\.espncdn\.com\//.test(s)))];
      await Promise.all(urls.map(async url => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!r.ok || !r.headers.get("content-type")?.startsWith("image/")) return;
          const bytes = new Uint8Array(await r.arrayBuffer());
          if (bytes.length > 250000 || bytes.length < 24) return;
          // The supplied ESPN 500px logos are PNGs; preserve aspect ratio from IHDR.
          if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return;
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const width = view.getUint32(16), height = view.getUint32(20);
          if (!width || !height || width > 512 || height > 512) return;
          logos.set(url, { naturalWidth: width, naturalHeight: height, data: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` });
        } catch { /* Missing crests do not prevent a dated, readable banner. */ }
      }));
      const canvas = createFootballSvgCanvas();
      drawFootballBanner(canvas as any, day, day === days[0] ? "Hoje" : "Amanhã", games, page, pages.length, false, region as BannerRegion, { background, logos } as any);
      // WhatsApp recompresses Status images. A 720×1280 delivery copy keeps the
      // same layout while staying inside the Edge CPU/memory budget. Manual
      // downloads in the site continue to use the full 1080×1920 canvas.
      const original = canvas.svg();
      // Fit the complete banner into a 4:5 frame, preserving every game.
      const svg = feed ? instagramFeedSvg(original) : original;
      const rendered = new Resvg(svg, { fitTo: { mode: "width", value: feed ? 1080 : 720 }, font: { fontBuffers: [font, boldFont], loadSystemFonts: false, defaultFontFamily: "Roboto" } });
      const raster = rendered.render(); png = raster.asPng(); raster.free(); rendered.free();
      if (pictures.size > 4) pictures.delete(pictures.keys().next().value!);
      pictures.set(key, { expires: Date.now() + 300000, data: png });
    }
    return new Response(png, { headers: { ...cors, "Content-Type": "image/png", "Cache-Control": "public, max-age=120" } });
  } catch (e) { console.warn("[football-banner]", e instanceof Error ? e.message : "Render failed"); return json({ error: "Não foi possível gerar o banner agora.", reason: e instanceof Error ? e.message : "Render failed" }, 503); }
});
