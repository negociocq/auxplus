import https from "node:https";

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

// achar 'idRes'=
let i = 0;
let n = 0;
while ((i = src.indexOf("idRes", i)) !== -1 && n < 25) {
  const chunk = src.slice(Math.max(0, i - 60), i + 100);
  // só atribuições
  if (/=/.test(chunk.slice(0, 80)) || chunk.includes("idRes':") || chunk.includes('idRes":')) {
    const hexes = [...new Set([...chunk.matchAll(/0x[a-f0-9]+/gi)].map((m) => m[0]))];
    const decoded = {};
    for (const h of hexes) {
      try {
        const v = dec(Number(h));
        if (typeof v === "string" && v.length < 60) decoded[h] = v;
      } catch {}
    }
    if (Object.keys(decoded).length || /idRes'\s*:/.test(chunk)) {
      console.log("\n---", i, "---");
      console.log(chunk);
      console.log(decoded);
    }
    n++;
  }
  i += 5;
}

// Resolve PmEtb / Zsquq actual path values from object near definition
for (const key of ["PmEtb", "Zsquq"]) {
  const re = new RegExp(key + ":\\s*(?:'([^']+)'|\"([^\"]+)\"|_0x[a-z0-9]+\\((0x[a-f0-9]+)\\))", "i");
  const m = src.match(re);
  console.log("\nkey", key, m && m[0]);
  if (m && m[3]) console.log(" =>", dec(Number(m[3])));
  if (m && (m[1] || m[2])) console.log(" =>", m[1] || m[2]);
}
