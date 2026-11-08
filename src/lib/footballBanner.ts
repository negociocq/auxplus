import { brasiliaDay, type FootballMatch } from "./uniplayDiscover.ts";

export function bannerDays(now = new Date()) {
  const today = brasiliaDay(now);
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [today, brasiliaDay(next)] as const;
}

export type BannerRegion = "national" | "international";
export type BannerImages = { background?: HTMLImageElement; logos: Map<string, HTMLImageElement> };

export function bannerPages(matches: FootballMatch[], day: string, region: BannerRegion = "national") {
  const games = matches.filter(m => (region === "national" ? m.brazil : !m.brazil && m.highlight) && brasiliaDay(new Date(m.date)) === day)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pages: FootballMatch[][] = [];
  for (let i = 0; i < games.length; i += 5) pages.push(games.slice(i, i + 5));
  return pages.length ? pages : [[]];
}

export async function loadBannerImages(games: FootballMatch[]): Promise<BannerImages> {
  const load = (url: string) => new Promise<HTMLImageElement | undefined>(resolve => {
    const image = new Image(); image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => { image.onload = null; image.onerror = null; resolve(undefined); }, 8000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); resolve(undefined); };
    image.src = url;
  });
  const urls = [...new Set(games.flatMap(g => [g.homeLogo, g.awayLogo]).filter((url): url is string => !!url && /^https:\/\/a\.espncdn\.com\//.test(url)))];
  const [background, ...logos] = await Promise.all([load("/banners/stadium-night.png"), ...urls.map(load)]);
  return { background, logos: new Map(urls.flatMap((url, i) => logos[i] ? [[url, logos[i]!] as const] : [])) };
}

/** A fresh 1080×1920 image; no date, fixtures or branding are baked into a background. */
export function drawFootballBanner(canvas: HTMLCanvasElement, day: string, label: string,
  games: FootballMatch[], page: number, total: number, partial: boolean, region: BannerRegion = "national", images?: BannerImages) {
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu gerar a imagem.");
  const international = region === "international";
  const accent = international ? "#a999ff" : "#43f58c";
  const bg = ctx.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, "#07172c"); bg.addColorStop(.7, "#031925"); bg.addColorStop(1, "#073d28");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1920);
  if (images?.background) ctx.drawImage(images.background, 0, 0, 1080, 1920);
  if (international) { ctx.fillStyle = "#27104e70"; ctx.fillRect(0, 0, 1080, 1920); }
  // Stadium lights, crowd and grass, rendered without remote images for reliable PNG export.
  for (const x of images?.background ? [] : [0, 1080]) {
    const glow = ctx.createRadialGradient(x, 240, 0, x, 240, 600);
    glow.addColorStop(0, "#c4f5ff66"); glow.addColorStop(.3, "#8ebddd15"); glow.addColorStop(1, "#8ebddd00");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1000);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "#e8faff"; ctx.fillRect(x === 0 ? 10 + i * 20 : 950 + i * 20, 230 + i * 3, 13, 18); }
  }
  for (let i = 0; i < 250; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#f3cd672a" : "#e1efff12";
    ctx.fillRect((i * 173) % 1080, 500 + (i * 67) % 1050, 4, 3);
  }
  ctx.strokeStyle = "#5cf1a61c"; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(540, 1300); ctx.lineTo(i * 110 - 80, 1920); ctx.stroke(); }
  function text(str: string, x: number, y: number, size: number, color = "#f6f9ff", weight = 700, max = 940) {
    ctx!.fillStyle = color; ctx!.textAlign = "center"; ctx!.textBaseline = "middle";
    let fontSize = size;
    do { ctx!.font = `${weight} ${fontSize--}px Arial, sans-serif`; } while (ctx!.measureText(str).width > max && fontSize > 15);
    ctx!.fillText(str, x, y);
  }
  function lines(str: string, max: number, size: number) {
    ctx!.font = `600 ${size}px Arial, sans-serif`;
    const result: string[] = []; let line = "";
    for (const word of str.split(" ")) {
      if (line && ctx!.measureText(`${line} ${word}`).width > max) { result.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) result.push(line);
    return result;
  }
  function box(x: number, y: number, w: number, h: number, fill: string, stroke: string) {
    ctx!.beginPath(); ctx!.roundRect(x, y, w, h, 24); ctx!.fillStyle = fill; ctx!.fill();
    ctx!.strokeStyle = stroke; ctx!.lineWidth = 2; ctx!.stroke();
  }
  text("AUXPLUS", 540, 150, 62, accent, 900);
  text("FUTEBOL", 540, 280, 118, "#ffffff", 900);
  text(label.toLocaleUpperCase("pt-BR"), 540, 400, 116, accent, 900);
  const date = new Date(`${day}T12:00:00Z`);
  text(date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).toLocaleUpperCase("pt-BR"), 540, 510, 34, "#dce8ee", 600);
  box(200, 565, 680, 66, "#061b27", "#c5a65b");
  text(international ? "FUTEBOL INTERNACIONAL" : "FUTEBOL NACIONAL", 540, 598, 30, "#ebcf87", 800);
  games.forEach((game, i) => {
    const y = 674 + i * 193;
    box(58, y, 964, 175, international ? "#100e29ed" : "#03131fed", `${accent}88`);
    box(82, y + 26, 170, 61, accent, accent);
    text(new Date(game.date).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).replace(":", "h"), 167, y + 57, 39, "#031b18", 900, 155);
    for (const [url, x] of [[game.homeLogo, 280], [game.awayLogo, 900]] as const) {
      const logo = url && images?.logos.get(url);
      if (logo) { const scale = Math.min(95 / logo.naturalWidth, 110 / logo.naturalHeight); const w = logo.naturalWidth * scale, h = logo.naturalHeight * scale; ctx.drawImage(logo, x + (95 - w) / 2, y + 10 + (110 - h) / 2, w, h); }
    }
    text(game.home.toLocaleUpperCase("pt-BR"), 634, y + 35, 35, "#ffffff", 800, 495);
    text("×", 634, y + 69, 28, accent);
    text(game.away.toLocaleUpperCase("pt-BR"), 634, y + 103, 35, "#ffffff", 800, 495);
    const channels = game.channels.length ? game.channels.join(" • ") : "Transmissão a confirmar";
    text("ONDE ASSISTIR", 172, y + 137, 18, accent, 800, 180);
    let channelSize = 23;
    let channelLines = lines(channels, 710, channelSize);
    while (channelLines.length > 2 && channelSize > 15) channelLines = lines(channels, 710, --channelSize);
    channelLines.forEach((line, index) => text(line, 633, y + 135 + index * 25, channelSize, "#dce8ee", 600, 715));
  });
  if (!games.length) {
    text(international ? "Nenhum destaque internacional" : "Nenhum jogo brasileiro", 540, 945, 46);
    text("encontrado nesta data.", 540, 1005, 40, "#c2d1dc");
  }
  if (partial) text("AGENDA PARCIAL • CONSULTE A PROGRAMAÇÃO", 540, 1673, 22, "#ebcf87");
  text("HORÁRIOS DE BRASÍLIA", 540, 1735, 27, "#ebcf87", 800);
  text("Fontes: ESPN • Onde Assistir • Futebol na TV", 540, 1780, 22, "#dce8ee", 400);
  text("Programação sujeita a alterações.", 540, 1815, 22, "#dce8ee", 400);
  if (total > 1) text(`${page + 1} / ${total}`, 540, 1855, 22, accent);
}
