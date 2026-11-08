import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";
import { Buffer } from "node:buffer";
import { catalogBannerSvg, type CatalogBannerPage } from "../../../src/lib/catalogBanner.ts";
import * as bundled from "../wa-content-status/renderAssets.ts";

const decode = async (value: string) => {
  const compressed = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};
let ready: Promise<{ font: Uint8Array; bold: Uint8Array }> | undefined;
async function initialize() {
  if (!ready) ready = (async () => { const [wasm, font, bold] = await Promise.all([decode(bundled.wasm), decode(bundled.font), decode(bundled.bold)]); await initWasm(wasm); return { font, bold }; })();
  return ready;
}
const images = new Map<string, string>();
export async function renderContentBanner(page: CatalogBannerPage) {
  const { font, bold } = await initialize();
  const posters: Record<string, string> = {};
  await Promise.all(page.titles.map(async title => {
    try {
      if (!title.image) return;
      const url = new URL(title.image);
      if (url.protocol !== "https:") return;
      if (["www.themoviedb.org", "themoviedb.org"].includes(url.hostname)) url.hostname = "image.tmdb.org";
      if (url.hostname === "image.tmdb.org" && !/^\/t\/p\/[\w]+\/[\w.-]+$/.test(url.pathname)) return;
      if (!["image.tmdb.org", "m.media-amazon.com", "images.metahub.space"].includes(url.hostname)) return;
      const key = url.toString();
      if (!images.has(key)) {
        const response = await fetch(key, { redirect: "error", signal: AbortSignal.timeout(8000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 1500000) return;
        const mime = response.headers.get("content-type")!.split(";")[0];
        images.set(key, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
        while (images.size > 40) images.delete(images.keys().next().value!);
      }
      posters[title.key] = images.get(key)!;
    } catch { /* Render an honest missing-cover placeholder instead of fetching arbitrary hosts. */ }
  }));
  if (page.titles.length && !Object.keys(posters).length) throw new Error("As capas estão indisponíveis. Tente novamente; nenhum Status foi enviado.");
  const renderer = new Resvg(catalogBannerSvg(page, posters), { fitTo: { mode: "width", value: 720 }, font: { fontBuffers: [font, bold], loadSystemFonts: false, defaultFontFamily: "Roboto" } });
  const raster = renderer.render(); const png = raster.asPng(); raster.free(); renderer.free(); return png;
}
