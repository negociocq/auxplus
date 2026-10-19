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

// Locate the printed code before restricting the alphabet. Restricting a whole
// screen would turn unrelated words into plausible hexadecimal identifiers.
async function refineDeviceLines(engine, data, app, isolateCode = false) {
  if (!data.tsv || !data.imageColor) return null;
  const groups = new Map();
  for (const row of data.tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c[0] !== "5" || !c[11]?.trim()) continue;
    const key = c.slice(1, 5).join(":");
    const box = { left: +c[6], top: +c[7], right: +c[6] + +c[8], bottom: +c[7] + +c[9], text: c.slice(11).join(" ") };
    const previous = groups.get(key);
    if (previous) {
      previous.text += " " + box.text;
      previous.left = Math.min(previous.left, box.left);
      previous.top = Math.min(previous.top, box.top);
      previous.right = Math.max(previous.right, box.right);
      previous.bottom = Math.max(previous.bottom, box.bottom);
    } else groups.set(key, box);
  }
  const lines = [...groups.values()].sort((a, b) => a.top - b.top);
  if (app === "prime") {
    const candidates = lines.filter(line => /mac/i.test(line.text) && (line.text.match(/:/g) || []).length >= 4);
    if (candidates.length !== 1) return null;
    const line = candidates[0];
    const codeWords = data.tsv.split("\n").slice(1).map(row => row.split("\t")).filter(c => c[0] === "5" && +c[7] >= line.top && +c[7] <= line.bottom && (String(c[11]).match(/:/g) || []).length >= 4);
    const labelWord = data.tsv.split("\n").slice(1).map(row => row.split("\t")).find(c => c[0] === "5" && +c[7] >= line.top && +c[7] <= line.bottom && /^mac[:;]?$/i.test(c[11]));
    if (isolateCode && codeWords.length !== 1 && !labelWord) return null;
    const c = codeWords[0];
    const box = !isolateCode ? line : codeWords.length === 1
      ? { left: +c[6], top: +c[7], right: +c[6] + +c[8], bottom: +c[7] + +c[9] }
      : { ...line, left: +labelWord[6] + +labelWord[8] + 12 };
    const corrected = Buffer.from(data.imageColor.split(",")[1], "base64");
    const metadata = await sharp(corrected).metadata();
    const readings = [];
    try {
      await engine.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789ABCDEFabcdef:-" });
      for (const invert of [false, true]) {
        const left = Math.max(0, box.left - 12), top = Math.max(0, box.top - 10);
        let crop = sharp(corrected).extract({ left, top, width: Math.min(metadata.width, box.right + 12) - left, height: Math.min(metadata.height, box.bottom + 10) - top }).resize({ height: 160 });
        if (invert) crop = crop.negate();
        const reading = await engine.recognize(await crop.png().toBuffer());
        readings.push(extractDeviceFromOcr("prime", reading.data.text));
      }
    } finally {
      await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: "" });
    }
    return readings.every(result => result.readable && result.device === readings[0].device) ? readings[0] : null;
  }
  const starts = lines.filter(line => /^[a-z0-9\s-]+$/i.test(line.text) && (line.text.match(/-/g) || []).length >= 3);
  if (starts.length !== 1) return null;
  const first = starts[0];
  const next = lines.find(line => line.top > first.bottom && line.top - first.bottom < (first.bottom - first.top) * 3 && /^[a-z0-9\s]+$/i.test(line.text) && line.text.replace(/\s/g, "").length === 12);
  if (!next) return null;
  const corrected = Buffer.from(data.imageColor.split(",")[1], "base64");
  const metadata = await sharp(corrected).metadata();
  const readings = [];
  try {
    await engine.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789ABCDEF-:" });
    for (const invert of [false, true]) {
      const texts = [];
      for (const box of [first, next]) {
        const left = Math.max(0, box.left - 12), top = Math.max(0, box.top - 10);
        let crop = sharp(corrected).extract({ left, top, width: Math.min(metadata.width, box.right + 12) - left, height: Math.min(metadata.height, box.bottom + 10) - top }).resize({ height: 160 });
        if (invert) crop = crop.negate();
        const reading = await engine.recognize(await crop.png().toBuffer());
        texts.push(reading.data.text.trim());
      }
      readings.push(extractDeviceFromOcr("pixel", "Device ID:\n" + texts.join("\n")));
    }
  } finally {
    await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: "" });
  }
  return readings.every(result => result.readable && result.device === readings[0].device) ? readings[0] : null;
}

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
    const { data } = await engine.recognize(processed, { rotateAuto: true }, { text: true, tsv: app !== "utm", imageColor: app !== "utm" });
    const result = extractDeviceFromOcr(app, data.text);
    observe?.({ confidence: data.confidence, text: data.text, result });
    if (result.reason === "example_image") return result;
    if (data.confidence >= 55 && result.readable) return result;
    if (app !== "utm" && data.confidence >= 55) {
      const refined = await refineDeviceLines(engine, data, app);
      if (refined) return refined;
    }
  }
  if (app === "utm" || app === "prime") {
    // TV scan patterns can look like scattered characters. Read the dialog as
    // a block, with its light text inverted, without automatic orientation.
    const portrait = height > width;
    const top = Math.floor(height * (app === "prime" ? .5 : portrait ? .4 : .2));
    const crop = await sharp(image).extract({ left: 0, top, width, height: Math.min(height - top, Math.floor(height * (app === "prime" ? .3 : portrait ? .25 : .65))) }).png().toBuffer();
    try {
      await engine.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      for (const angle of [0, 5, -5, 15, -15]) {
        const processed = await sharp(crop).rotate(angle, { background: "white" }).resize({ width: Math.min(Math.round(width * 2.5), 3000) }).grayscale().normalise().negate().png().toBuffer();
        const { data } = await engine.recognize(processed, { rotateAuto: false }, { text: true, tsv: app === "prime", imageColor: app === "prime" });
        const result = extractDeviceFromOcr(app, data.text);
        observe?.({ confidence: data.confidence, text: data.text, result });
        if (result.reason === "example_image") return result;
        if (data.confidence >= 70 && result.readable) return result;
        if (app === "prime" && data.confidence >= 55) {
          const refined = await refineDeviceLines(engine, data, app, true);
          await engine.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
          if (refined) return refined;
        }
      }
    } finally {
      await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    }
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
