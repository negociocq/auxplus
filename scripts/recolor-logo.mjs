import { Jimp } from "./tmp-tools/node_modules/jimp/dist/esm/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "public", "auxplus-logo.png");
const backup = path.join(__dirname, "..", "public", "auxplus-logo-original.png");
const out = src;

// Cor do site / amostra enviada (#207e6f)
const TARGET = { r: 0x20, g: 0x7e, b: 0x6f };

if (!fs.existsSync(backup) && fs.existsSync(src)) {
  fs.copyFileSync(src, backup);
}

const img = await Jimp.read(fs.existsSync(backup) ? backup : src);
img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
  const r = this.bitmap.data[idx];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];
  const a = this.bitmap.data[idx + 3];
  if (a < 8) return;

  // Mantém quase-preto (fundo); recolore pixels claros/cian
  const brightness = (r + g + b) / 3;
  const isDark =
    brightness < 40 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20;
  if (isDark) {
    this.bitmap.data[idx] = 0;
    this.bitmap.data[idx + 1] = 0;
    this.bitmap.data[idx + 2] = 0;
    return;
  }

  // Cor sólida do site nos traços do logo (cian → teal)
  this.bitmap.data[idx] = TARGET.r;
  this.bitmap.data[idx + 1] = TARGET.g;
  this.bitmap.data[idx + 2] = TARGET.b;
});

await img.write(out);
console.log("Logo recolorida:", out);
