import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { extractDeviceFromOcr } from "./lib/device-ocr-text.mjs";
import { recognizeDeviceImage, closeOcrWorker, handleLocalDeviceOcr } from "./lib/local-device-ocr.mjs";

const mac = "02:11:22:33:44:55";
const id = "1234ABCD-5678-90AB-CDEF-1234567890AB";
assert.equal(extractDeviceFromOcr("prime", `Endereço MAC: ${mac}`).device, mac);
assert.equal(extractDeviceFromOcr("utm", `MAC: ${mac}\nDevice Key: 001234`).deviceKey, "001234");
assert.equal(extractDeviceFromOcr("pixel", `Device ID:\n1234ABCD-5678-90AB-CDEF-\n1234567890AB`).device, id);
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
];
let server;
try {
  for (const [app, lines, expected] of cases) {
    const result = await recognizeDeviceImage(await makeImage(lines), app);
    assert.equal(result.readable, true, app);
    for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, `${app}: ${key}`);
    console.log(`PASS real local OCR: ${app}`);
  }
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
