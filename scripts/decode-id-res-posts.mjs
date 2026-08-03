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

// todas ocorrências de id_res no source (literal)
let i = 0;
let n = 0;
while ((i = src.indexOf("id_res", i)) !== -1 && n < 15) {
  console.log("\n==== id_res", n, i, "====");
  console.log(src.slice(Math.max(0, i - 200), i + 250));
  const chunk = src.slice(Math.max(0, i - 200), i + 250);
  for (const h of new Set([...chunk.matchAll(/0x[a-f0-9]+/gi)].map((m) => m[0]))) {
    try {
      const v = dec(Number(h));
      if (typeof v === "string" && v.length < 80) console.log(" ", h, JSON.stringify(v));
    } catch {}
  }
  i += 6;
  n++;
}
