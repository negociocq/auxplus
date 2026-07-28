import fs from "node:fs";

const jsonl = process.argv[2];
const lines = fs.readFileSync(jsonl, "utf8").split(/\n/).filter(Boolean);

let dump = null;

function walk(o) {
  if (dump || o == null) return;
  if (typeof o === "string") {
    if (
      o.includes("sql302.infinityfree.com") &&
      o.includes("CREATE TABLE `items`")
    ) {
      dump = o;
    }
    return;
  }
  if (Array.isArray(o)) {
    for (const v of o) walk(v);
    return;
  }
  if (typeof o === "object") {
    for (const v of Object.values(o)) walk(v);
  }
}

for (const line of lines) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  walk(obj);
  if (dump) break;
}

if (!dump) {
  console.error("Dump não encontrado no transcript");
  process.exit(1);
}

const idx = dump.indexOf("-- phpMyAdmin");
if (idx >= 0) dump = dump.slice(idx);

fs.writeFileSync("legacy/auxplus_dump.sql", dump, "utf8");
console.log(
  "OK",
  dump.length,
  "chars",
  dump.split(/\n/).length,
  "lines",
);
