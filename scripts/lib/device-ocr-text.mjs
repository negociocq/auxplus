const macPattern = /\b(?:[a-f0-9]{2}\s*[:-]\s*){5}[a-f0-9]{2}\b|\b[a-f0-9]{12}\b/gi;
const unique = values => [...new Set(values)];
const failed = reason => ({ readable: false, device: "", deviceKey: "", reason });

/** Never repairs ambiguous characters; incomplete or conflicting codes require a new photo. */
export function extractDeviceFromOcr(app, text) {
  if (!['prime', 'utm', 'pixel'].includes(app)) return failed("wrong_app");
  const normalized = String(text).replace(/[–—−]/g, "-");
  if (/EXEMPLO|DADOS\s+FICT[IÍ]CIOS|EXAMPLE/i.test(normalized)) return failed("example_image");
  if (app === "pixel") {
    const guid = /\b[a-f0-9]{8}\s*-\s*[a-f0-9]{4}\s*-\s*[a-f0-9]{4}\s*-\s*[a-f0-9]{4}\s*-\s*[a-f0-9]{12}\b/gi;
    const ids = unique((normalized.match(guid) || []).map(value => value.replace(/\s/g, "")));
    if (ids.length > 1) return failed("unreadable");
    if (ids.length === 1) return { readable: true, device: ids[0], deviceKey: "", reason: "ok" };
    const label = normalized.match(/device\s*id\s*[:：;]?\s*([^\n]*)\n?([^\n]*)/i);
    if (label) {
      const fragments = [label[1], label[2]].map(part => part.trim()).filter(Boolean);
      // Android Pixel versions label a full MAC as "Device ID".
      const exactMac = /^(?:(?:[a-f0-9]{2}\s*[:-]\s*){5}[a-f0-9]{2}|[a-f0-9]{12})$/i;
      const labeledMacs = unique(fragments.filter(part => exactMac.test(part)).map(part => part.replace(/[\s:-]/g, "").toLowerCase()));
      if (labeledMacs.length) {
        const allMacs = unique((normalized.match(macPattern) || []).map(part => part.replace(/[\s:-]/g, "").toLowerCase()));
        if (labeledMacs.length !== 1 || allMacs.length !== 1) return failed("unreadable");
        if (labeledMacs[0] === "aabbccddeeff") return failed("example_image");
        return { readable: true, device: labeledMacs[0].match(/.{2}/g).join(":"), deviceKey: "", reason: "ok" };
      }
      const value = fragments.filter(part => /^[a-z0-9-]+$/i.test(part)).join("");
      // A UUID which was cut off must never be accepted as a shorter ID.
      if (/^[a-f0-9-]+$/i.test(value) && value.includes("-")) return failed("unreadable");
      if (/^[a-z0-9]{16,128}$/i.test(value)) return { readable: true, device: value, deviceKey: "", reason: "ok" };
      return failed("unreadable");
    }
  }
  const matches = normalized.match(macPattern) || [];
  const macs = unique(matches.map(value => value.replace(/[\s:-]/g, "").toLowerCase()));
  if (macs.length !== 1 || macs[0] === "aabbccddeeff") return failed(macs[0] === "aabbccddeeff" ? "example_image" : "unreadable");
  const device = macs[0].match(/.{2}/g).join(":");
  if (app !== "utm") return { readable: true, device, deviceKey: "", reason: "ok" };
  const withoutMac = normalized.replace(macPattern, " ");
  const keys = unique([...withoutMac.matchAll(/(?:device\s*key|chave(?:\s+do\s+dispositivo)?)\s*[:：]?\s*(\d{6})\b/gi)].map(match => match[1]));
  const candidates = keys.length ? keys : unique(withoutMac.match(/\b\d{6}\b/g) || []);
  if (candidates.length !== 1) return failed("unreadable");
  return { readable: true, device, deviceKey: candidates[0], reason: "ok" };
}
