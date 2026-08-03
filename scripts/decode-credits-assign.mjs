/**
 * Descobre como o front UniPlay preenche dash.credits / creditPortal.
 */
import https from "node:https";
import fs from "node:fs";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
        const c = [];
        res.on("data", (d) => c.push(d));
        res.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
      })
      .on("error", reject);
  });
}

const home = await get("https://searchdefense.top/");
const href = (home.match(/src="([^"]*app\.[a-f0-9]+\.js)"/) || [])[1];
const src = await get(`https://searchdefense.top${href}`);
const marker = "}(a0_0x26b3,";
const shuffleAt = src.indexOf(marker);
const iifeStart = src.lastIndexOf("(function(_0x", shuffleAt);
const closeParen =
  shuffleAt + marker.length + src.slice(shuffleAt + marker.length).indexOf(")");
const shuffleCall = src.slice(iifeStart, closeParen + 1) + ")";
const dec = new Function(
  `${src.slice(0, iifeStart)}\nvar __s=${shuffleCall};\nreturn a0_0x378c;`,
)();

function dumpAround(label, idx, span = 500) {
  if (idx < 0) return;
  const chunk = src.slice(Math.max(0, idx - 80), idx + span);
  console.log("\n====", label, idx, "====");
  console.log(chunk);
  const hexes = [...new Set([...chunk.matchAll(/0x[a-f0-9]+/gi)].map((m) => m[0]))];
  for (const h of hexes) {
    try {
      const v = dec(Number(h));
      if (typeof v === "string" && v.length < 100) console.log(" ", h, JSON.stringify(v));
    } catch {}
  }
}

dumpAround("getCreditsAndPortal", src.indexOf("'getCreditsAndPortal'"), 1200);
dumpAround("getCreditsValue", src.indexOf("'getCreditsValue'"), 800);

// usos de creditPortal / credits após then
let i = 0;
let n = 0;
while ((i = src.indexOf("creditPort", i)) !== -1 && n < 12) {
  dumpAround("creditPort@" + n, i, 220);
  i += 10;
  n++;
}

// path constants usados com /api/recargas
for (const h of [0x22da, 0x2d5a, 0xd07, 0x2cb2, 0x17a9, 0x1d33, 0xb70, 0x7e4]) {
  try {
    console.log("hex", h.toString(16), JSON.stringify(dec(h)));
  } catch {}
}

// procurar '/credits' concatenado
for (const needle of ["'/credits'", '"/credits"', "+'credits'", "+\"credits\"", "/credits'"]) {
  let p = 0;
  let c = 0;
  while ((p = src.indexOf(needle, p)) !== -1 && c < 6) {
    dumpAround(needle, p, 180);
    p += needle.length;
    c++;
  }
}

fs.writeFileSync(
  "scripts/_credit-keys.json",
  JSON.stringify(
    {
      credits: dec(0x4d5a),
      creditPort: dec(0x11a2),
      pathCriar: "/api/recargas" + dec(0x7e4) /* wrong */,
    },
    null,
    2,
  ),
);
