import { renderContentBanner } from "../supabase/functions/_shared/contentBannerRender.ts";
import { normalizeCatalog } from "../src/lib/uniplayDiscover.ts";
import { catalogBannerPages } from "../src/lib/catalogBanner.ts";
const raw = JSON.parse(await Deno.readTextFile("tmp/catalog-diagnostic.json"));
const pages = catalogBannerPages(normalizeCatalog(raw), 1);
if (!pages.length) throw new Error("No catalog pages");
const png = await renderContentBanner(pages[0]);
await Deno.writeFile("tmp/catalog-banner-render-check.png", png);
console.log(JSON.stringify({ pages: pages.length, pngBytes: png.length, pngSignature: [...png.slice(0, 4)], kind: pages[0].kind, titles: pages[0].titles.length }));
