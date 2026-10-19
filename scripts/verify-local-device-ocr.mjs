import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { extractDeviceFromOcr } from "./lib/device-ocr-text.mjs";
import { recognizeDeviceImage, closeOcrWorker, handleLocalDeviceOcr } from "./lib/local-device-ocr.mjs";

const mac = "02:11:22:33:44:55";
const id = "1234ABCD-5678-90AB-CDEF-1234567890AB";
const tizenId = "1234ABC-D5678-90AB-CDEF-1234567890AB";
assert.equal(extractDeviceFromOcr("prime", `Endereço MAC: ${mac}`).device, mac);
assert.equal(extractDeviceFromOcr("utm", `MAC: ${mac}\nDevice Key: 001234`).deviceKey, "001234");
assert.equal(extractDeviceFromOcr("pixel", `Device ID:\n1234ABCD-5678-90AB-CDEF-\n1234567890AB`).device, id);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n1234ABC-D5678-90AB-CDEF-\n1234567890AB\n(Tizen v1.5.91)").device, tizenId);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n1234ABC-D5678-90AB-CDEF-\n1234567890A\n(Tizen v1.5.91)").readable, false);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n1234ABC-D5678-90AB-CDEF-\n123456789OAB\n(Tizen v1.5.91)").readable, false);
assert.equal(extractDeviceFromOcr("pixel", "1234ABC-D5678-90AB-CDEF-\n123456789OAB").readable, false);
assert.equal(extractDeviceFromOcr("pixel", `Device ID:\n${id}\n${tizenId}`).readable, false);
assert.equal(extractDeviceFromOcr("pixel", `Device ID:\n${mac}\nTrial Ends: 19/07/2026`).device, mac);
assert.equal(extractDeviceFromOcr("pixel", `Device ID: ${mac}\n(AndroidTV v1.6.0)`).device, mac);
assert.equal(extractDeviceFromOcr("pixel", `Device ID;\n\n${mac}\n\n(AndroidTV v1.6.0)`).device, mac);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n021122334455\nTrial Ends").device, mac);
assert.equal(extractDeviceFromOcr("pixel", `Device ID:\n${mac}\n02:99:88:77:66:55`).readable, false);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n1234ABCD-5678-90AB-CDEF-").readable, false);
assert.equal(extractDeviceFromOcr("pixel", "Device ID:\n1234ABCD-5678-90AB-CDEF-123456789OAB").readable, false);
assert.equal(extractDeviceFromOcr("utm", `MAC: ${mac}\nDevice Key: 01234`).readable, false);
assert.equal(extractDeviceFromOcr("utm", `MAC: ${mac}\nDevice Key: 001234\nDevice Key: 991234`).readable, false);
assert.equal(extractDeviceFromOcr("prime", `${mac}\n02:99:88:77:66:55`).readable, false);
assert.equal(extractDeviceFromOcr("prime", `EXEMPLO\n${mac}`).reason, "example_image");

const makeImage = async lines => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="550"><rect width="100%" height="100%" fill="white"/>${lines.map((line, i) => `<text x="60" y="${90 + i * 80}" font-family="Arial" font-size="42" fill="black">${line}</text>`).join("")}</svg>`)).png().toBuffer();
const cases = [
  ["prime", ["Prime IPTV", `MAC: ${mac}`], { device: mac }],
  ["utm", ["UTM Play", `Your TV MAC Address: ${mac}`, "Your Device Key: 001234"], { device: mac, deviceKey: "001234" }],
  ["pixel", ["Pixel Player", "Device ID:", "1234ABCD-5678-90AB-CDEF-", "1234567890AB"], { device: id }],
  ["pixel", ["Pixel Player", "Device ID:", mac, "(AndroidTV v1.6.0)"], { device: mac }],
  ["pixel", ["Pixel Player", "Device ID:", "1234ABC-D5678-90AB-CDEF-", "1234567890AB"], { device: tizenId }],
];
let server;
try {
  for (const [app, lines, expected] of cases) {
    const passes = [];
    const result = await recognizeDeviceImage(await makeImage(lines), app, pass => passes.push(pass));
    assert.equal(result.readable, true, `${app}: ${JSON.stringify(passes)}`);
    for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, `${app}: ${key}`);
    console.log(`PASS real local OCR: ${app}`);
  }
  for (const angle of [-15, 15]) {
    const image = await sharp(await makeImage(["Pixel Player", "Device ID:", mac, "(AndroidTV v1.6.0)"])).rotate(angle, { background: "white" }).png().toBuffer();
    const passes = [];
    const result = await recognizeDeviceImage(image, "pixel", pass => passes.push(pass));
    assert.equal(result.readable, true, `Pixel MAC rotated ${angle}: ${JSON.stringify(passes)}`);
    assert.equal(result.device, mac);
    console.log(`PASS real local OCR: Pixel MAC rotated ${angle}`);
  }
  const samsungId = "5A8BF5BB-82CD-41E0-B463-D8D1E0B57233";
  const samsungImage = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="100%" height="100%" fill="#28352f"/><g font-family="Arial" fill="white" text-anchor="middle"><text x="360" y="450" font-size="24">Use your phone to add a profile</text><text x="360" y="530" font-size="24">Device ID:</text><text x="360" y="580" font-size="26">5A8BF5BB-82CD-41E0-B463-</text><text x="360" y="625" font-size="26">D8D1E0B57233</text><text x="360" y="740" font-size="24">Trial ends: 25/10/2026</text></g></svg>`)).jpeg().toBuffer();
  const samsungResult = await recognizeDeviceImage(samsungImage, "pixel");
  assert.equal(samsungResult.device, samsungId);
  console.log("PASS real local OCR: Samsung two-line ID on dark background");
  const primePhoto = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="100%" height="100%" fill="#1665a8"/><g font-family="Arial" font-weight="bold" fill="white"><text x="60" y="850" font-size="27">Chave do dispositivo: 001234</text><text x="60" y="895" font-size="27">Endereco Mac: ${mac}</text></g></svg>`)).rotate(15, { background: "#1665a8" }).jpeg().toBuffer();
  assert.equal((await recognizeDeviceImage(primePhoto, "prime")).device, mac);
  console.log("PASS real local OCR: tilted Prime MAC on blue background");
  process.env.LOCAL_OCR_TOKEN = "f".repeat(64);
  server = http.createServer((req, res) => void handleLocalDeviceOcr(req, res));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/ocr/health`)).status, 401);
  assert.equal((await fetch(`${base}/ocr/health`, { headers: { Authorization: "Bearer " + "a".repeat(64) } })).status, 401);
  const headers = { Authorization: `Bearer ${process.env.LOCAL_OCR_TOKEN}`, "Content-Type": "application/json" };
  assert.equal((await fetch(`${base}/ocr/health`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/ocr/device`, { method: "POST", headers, body: JSON.stringify({ app: "pixel", image: "https://example.test/image.png" }) })).status, 400);
  const image = (await makeImage(["Prime IPTV", `MAC: ${mac}`])).toString("base64");
  const response = await fetch(`${base}/ocr/device`, { method: "POST", headers, body: JSON.stringify({ app: "prime", image: `data:image/png;base64,${image}` }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).device, mac);
  console.log("PASS: local HTTP authentication, image validation and real OCR; ambiguous and incomplete codes rejected. No paid API calls.");
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await closeOcrWorker();
}
