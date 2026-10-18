import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import language from "@tesseract.js-data/eng";
import { extractDeviceFromOcr } from "./device-ocr-text.mjs";

const tokenFile = new URL("../../.local/ocr-token", import.meta.url);
let workerPromise;
let busy = false;
export async function closeOcrWorker() {
  const worker = workerPromise;
  workerPromise = undefined;
  if (worker) await (await worker).terminate();
}
const worker = () => workerPromise ||= createWorker("eng", 1, { langPath: language.langPath, gzip: true, cacheMethod: "none", errorHandler: () => {} }).then(async instance => {
  await instance.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "300" });
  return instance;
}).catch(error => { workerPromise = undefined; throw error; });

export async function recognizeDeviceImage(buffer, app, observe) {
  const engine = await worker();
  const image = await sharp(buffer, { limitInputPixels: 16000000 }).rotate().png().toBuffer();
  const { width, height } = await sharp(image).metadata();
  const region = app === "utm" ? { left: .15, top: .2, width: .7, height: .65 } : { left: .5, top: .35, width: .5, height: .65 };
  const passes = [{ area: null, angle: 0 }, { area: region, angle: 0 }, { area: null, angle: -15 }, { area: null, angle: 15 }];
  for (const { area, angle } of passes) {
    let pipeline = sharp(image);
    let sourceWidth = width;
    if (area) {
      const left = Math.floor(width * area.left), top = Math.floor(height * area.top);
      sourceWidth = Math.floor(width * area.width);
      pipeline = pipeline.extract({ left, top, width: Math.min(width - left, sourceWidth), height: Math.min(height - top, Math.floor(height * area.height)) });
    }
    if (angle) pipeline = pipeline.rotate(angle, { background: "white" });
    const processed = await pipeline.resize({ width: Math.min(sourceWidth * 2, 3000) }).grayscale().normalise().sharpen().png().toBuffer();
    const { data } = await engine.recognize(processed, { rotateAuto: true });
    const result = extractDeviceFromOcr(app, data.text);
    observe?.({ confidence: data.confidence, text: data.text, result });
    if (result.reason === "example_image") return result;
    if (data.confidence >= 55 && result.readable) return result;
  }
  return { readable: false, device: "", deviceKey: "", reason: "unreadable" };
}

/** An authenticated, bounded endpoint; no image URLs, files or OCR text are stored. */
export async function handleLocalDeviceOcr(req, res) {
  const route = (req.url || "").split("?")[0];
  if (!["/ocr/device", "/ocr/health"].includes(route)) return false;
  const reply = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  let expected = process.env.LOCAL_OCR_TOKEN || "";
  if (!expected && fs.existsSync(tokenFile)) expected = fs.readFileSync(tokenFile, "utf8").trim();
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) { reply(401, { error: "local_ocr_auth" }); return true; }
  if (route === "/ocr/health" && req.method === "GET") { reply(200, { provider: "local", ready: true, busy }); return true; }
  if (req.method !== "POST" || route !== "/ocr/device") { reply(405, { error: "invalid_method" }); return true; }
  if (busy) { reply(429, { error: "local_ocr_busy" }); return true; }
  busy = true;
  let timer;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 12500000) { reply(413, { error: "invalid_image" }); return true; }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!["prime", "utm", "pixel"].includes(body.app) || typeof body.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(body.image)) { reply(400, { error: "invalid_image" }); return true; }
    const image = Buffer.from(body.image.slice(body.image.indexOf(",") + 1), "base64");
    if (image.length > 9000000) { reply(413, { error: "invalid_image" }); return true; }
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 40000); });
    const result = await Promise.race([recognizeDeviceImage(image, body.app), timeout]);
    reply(200, result);
  } catch {
    await closeOcrWorker().catch(() => {});
    reply(503, { error: "local_ocr_unavailable" });
  } finally { clearTimeout(timer); busy = false; }
  return true;
}
