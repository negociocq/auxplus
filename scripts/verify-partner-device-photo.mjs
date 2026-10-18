import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

async function loadTs(path) {
  const source = fs.readFileSync(path, "utf8");
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
  }, reportDiagnostics: true });
  assert.equal(result.diagnostics.length, 0, path);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
}
const { validatePhotoDevice, readPartnerDevicePhoto, photoConfirmation } = await loadTs("supabase/functions/_shared/partnerDevicePhoto.ts");
const { parsePartnerDeviceText } = await loadTs("supabase/functions/_shared/partnerTestFlow.ts");
const utm = validatePhotoDevice("utm", { readable: true, device: "021122334455", deviceKey: "001234" });
assert.deepEqual(utm, { device: "02:11:22:33:44:55", deviceKey: "001234" });
assert.deepEqual(parsePartnerDeviceText("utm", `${utm.device} ${utm.deviceKey}`), utm);
for (const raw of [
  { readable: false, device: "021122334455", deviceKey: "001234" },
  { readable: true, device: "021122334455", deviceKey: "1234" },
  { readable: true, device: "021122334455", deviceKey: 123456 },
  { readable: true, device: "GABBCCDDEEFF", deviceKey: "001234" },
]) assert.throws(() => validatePhotoDevice("utm", raw));
assert.throws(() => validatePhotoDevice("prime", { readable: true, device: "AA:BB:CC:DD:EE:FF" }), /example_image/);
assert.throws(() => validatePhotoDevice("pixel", { readable: true, device: "EXEMPLO-0000-1111-2222" }), /example_image/);
const fullId = "00Device-021122334455-9876543210";
const pixel = validatePhotoDevice("pixel", { readable: true, device: fullId });
assert.equal(parsePartnerDeviceText("pixel", pixel.device).device, fullId);
assert.equal(parsePartnerDeviceText("pixel", "00Device-021122334455-\n9876543210").device, fullId);
assert.throws(() => validatePhotoDevice("pixel", { readable: true, device: "incomplete".slice(0, 5) }));
assert.ok(photoConfirmation(utm, "utm").includes("001234"));
assert.ok(photoConfirmation(pixel, "pixel").includes(fullId));

const options = { app: "utm", apiKey: "test-only", model: "mock-model",
  evolutionBase: "https://evolution.test/", evolutionKey: "mock-evo", instance: "test instance",
  message: { key: { id: "message-123" }, message: { imageMessage: {} } } };
let calls = [];
const mock = async (url, init) => {
  calls.push({ url, init });
  if (calls.length === 1) return Response.json({ base64: "aGVsbG8=", mimetype: "image/jpeg" });
  return Response.json({ status: "completed", output: [{ content: [{ type: "output_text",
    text: JSON.stringify({ readable: true, device: "021122334455", deviceKey: "001234" }) }] }] });
};
assert.equal((await readPartnerDevicePhoto(options, mock)).deviceKey, "001234");
assert.equal(calls.length, 2);
assert.ok(calls[0].url.endsWith("/chat/getBase64FromMediaMessage/test%20instance"));
assert.equal(JSON.parse(calls[0].init.body).message.key.id, "message-123");
const request = JSON.parse(calls[1].init.body);
assert.equal(request.store, false);
assert.equal(request.text.format.strict, true);
assert.ok(request.input[0].content[1].image_url.startsWith("data:image/jpeg;base64,"));
assert.ok(calls.every(call => !call.url.includes("activate")));
await assert.rejects(readPartnerDevicePhoto({ ...options, apiKey: "" }, () => { throw new Error("Must not call network"); }), /not_configured/);
await assert.rejects(readPartnerDevicePhoto(options, async () => new Response("", { status: 503 })), /media_unavailable/);
await assert.rejects(readPartnerDevicePhoto(options, async () => Response.json({ base64: "aGVsbG8=", mimetype: "video/mp4" })), /invalid_image/);
let stage = 0;
await assert.rejects(readPartnerDevicePhoto(options, async () => ++stage === 1
  ? Response.json({ base64: "aGVsbG8=", mimetype: "image/png" })
  : Response.json({ status: "incomplete", output: [] })), /incomplete_reading/);

const webhook = fs.readFileSync("supabase/functions/evolution-webhook/index.ts", "utf8");
// The guide module imports only a type, so transpilation needs no module resolver.
const { partnerDeviceGuide, partnerGuideUrl } = await loadTs("supabase/functions/_shared/partnerDeviceGuide.ts");
assert.ok(partnerDeviceGuide("utm", true).includes("User Account"));
assert.ok(partnerDeviceGuide("utm", true).includes("Settings"));
assert.ok(partnerDeviceGuide("pixel", true).includes("duas linhas"));
assert.ok(partnerDeviceGuide("prime", true).includes("Endereço MAC"));
assert.ok(!partnerDeviceGuide("prime", false).includes("Pode mandar uma foto"));
assert.equal(partnerGuideUrl("https://example.test/", "utm"), "https://example.test/atendimento/utm-device-guide.png");
assert.equal(partnerGuideUrl("not a url", "utm"), undefined);
assert.equal(partnerGuideUrl("http://example.test", "utm"), undefined);
const syntax = ts.transpileModule(webhook, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
assert.equal(syntax.diagnostics.length, 0);
console.log("PASS: MAC formats, UTM leading zeroes, full Pixel ID, invalid readings, confirmation text, mocked API contract, unavailable services, webhook syntax. No real network calls.");
