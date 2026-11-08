// Minimal SVG recording context for the SAME banner drawing routine used by the site.
// It avoids a native graphics dependency in the Edge runtime; resvg converts this to PNG.
const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Gradient = { id: string; addColorStop: (offset: number, color: string) => void };
export type SvgImage = { naturalWidth: number; naturalHeight: number; data: string };

export function instagramFeedSvg(original: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#07172c"/>${original.replace('<svg ', '<svg x="160.3125" y="0" ').replace('width="1080" height="1920"','width="759.375" height="1350"')}</svg>`;
}
export function createFootballSvgCanvas() {
  const elements: string[] = [], definitions: (() => string)[] = [];
  let path = "", gradientId = 0;
  const paint = (value: string | Gradient) => typeof value === "string" ? esc(value) : `url(#${value.id})`;
  function gradient(kind: string, attributes: string) {
    const stops: string[] = [], id = `g${gradientId++}`;
    definitions.push(() => `<${kind} id="${id}" gradientUnits="userSpaceOnUse" ${attributes}>${stops.join("")}</${kind}>`);
    return { id, addColorStop(offset: number, color: string) { stops.push(`<stop offset="${offset}" stop-color="${esc(color)}"/>`); } };
  }
  const ctx = {
    fillStyle: "#000" as string | Gradient, strokeStyle: "#000" as string | Gradient, lineWidth: 1,
    font: "700 30px Arial, sans-serif", textAlign: "center", textBaseline: "middle",
    createLinearGradient(x1: number, y1: number, x2: number, y2: number) { return gradient("linearGradient", `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`); },
    createRadialGradient(x1: number, y1: number, _r1: number, x2: number, y2: number, r2: number) { return gradient("radialGradient", `cx="${x2}" cy="${y2}" r="${r2}" fx="${x1}" fy="${y1}"`); },
    fillRect(x: number, y: number, w: number, h: number) { elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${paint(this.fillStyle)}"/>`); },
    beginPath() { path = ""; },
    moveTo(x: number, y: number) { path += `M${x} ${y} `; },
    lineTo(x: number, y: number) { path += `L${x} ${y} `; },
    roundRect(x: number, y: number, w: number, h: number, r: number) {
      path += `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
    },
    fill() { elements.push(`<path d="${path}" fill="${paint(this.fillStyle)}"/>`); },
    stroke() { elements.push(`<path d="${path}" fill="none" stroke="${paint(this.strokeStyle)}" stroke-width="${this.lineWidth}"/>`); },
    measureText(text: string) {
      const size = Number(this.font.match(/(\d+)px/)?.[1] || 30);
      // Conservative widths keep long team/channel names inside their card.
      const units = [...text].reduce((n, c) => n + (/\s/.test(c) ? .3 : /[ilI.,:!|]/.test(c) ? .31 : /[MW@]/.test(c) ? .95 : /[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(c) ? .74 : .61), 0);
      return { width: size * units };
    },
    fillText(text: string, x: number, y: number) {
      const size = Number(this.font.match(/(\d+)px/)?.[1] || 30), weight = this.font.match(/^(\d+)/)?.[1] || "700";
      elements.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Roboto" font-size="${size}" font-weight="${weight}" fill="${paint(this.fillStyle)}">${esc(text)}</text>`);
    },
    drawImage(image: SvgImage, x: number, y: number, w: number, h: number) {
      elements.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(image.data)}"/>`);
    },
  };
  return { width: 1080, height: 1920, getContext: () => ctx,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs>${definitions.map(d => d()).join("")}</defs>${elements.join("")}</svg>` };
}
