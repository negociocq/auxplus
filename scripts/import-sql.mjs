/**
 * Importa dump phpMyAdmin do AuxPlus → src/data/seed.json
 * Uso: node scripts/import-sql.mjs [caminho-do-sql]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sqlPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "legacy", "auxplus_dump.sql");
const outPath = path.join(root, "src", "data", "seed.json");

function fixEnc(s) {
  if (s == null) return s;
  const str = String(s);
  if (!/[ÃÂ]/.test(str) && !/Ã/.test(str)) return str;
  try {
    const fixed = Buffer.from(str, "latin1").toString("utf8");
    if (fixed.includes("\uFFFD")) return str;
    const badBefore = (str.match(/Ã./g) || []).length;
    const badAfter = (fixed.match(/Ã./g) || []).length;
    return badAfter <= badBefore ? fixed : str;
  } catch {
    return str;
  }
}

function parseValuesBlock(block) {
  const rows = [];
  let i = 0;
  const n = block.length;

  while (i < n) {
    while (i < n && /[\s,]/.test(block[i])) i++;
    if (i >= n) break;
    if (block[i] !== "(") {
      i++;
      continue;
    }
    i++; // skip (
    const fields = [];
    while (i < n && block[i] !== ")") {
      while (i < n && /\s/.test(block[i])) i++;
      if (block[i] === ")") break;
      if (block[i] === ",") {
        i++;
        continue;
      }

      if (block.slice(i, i + 4).toUpperCase() === "NULL") {
        fields.push(null);
        i += 4;
        continue;
      }

      if (block[i] === "'" || block[i] === '"') {
        const quote = block[i++];
        let val = "";
        while (i < n) {
          if (block[i] === "\\") {
            const next = block[i + 1];
            if (next === "n") {
              val += "\n";
              i += 2;
              continue;
            }
            if (next === "r") {
              val += "\r";
              i += 2;
              continue;
            }
            if (next === "t") {
              val += "\t";
              i += 2;
              continue;
            }
            if (next === "\\" || next === "'" || next === '"') {
              val += next;
              i += 2;
              continue;
            }
            val += next;
            i += 2;
            continue;
          }
          if (block[i] === quote) {
            // MySQL escaped quote ''
            if (block[i + 1] === quote) {
              val += quote;
              i += 2;
              continue;
            }
            i++;
            break;
          }
          val += block[i++];
        }
        fields.push(fixEnc(val));
        continue;
      }

      // number / bareword
      let raw = "";
      while (i < n && !/[,\)]/.test(block[i])) {
        raw += block[i++];
      }
      raw = raw.trim();
      if (raw === "") continue;
      if (/^-?\d+(\.\d+)?$/.test(raw)) fields.push(Number(raw));
      else fields.push(fixEnc(raw));
    }
    if (block[i] === ")") i++;
    if (fields.length) rows.push(fields);
  }
  return rows;
}

function extractInserts(sql, table) {
  const re = new RegExp(
    String.raw`INSERT INTO \`${table}\`\s*\(([^)]+)\)\s*VALUES\s*`,
    "gi",
  );
  const allRows = [];
  let match;
  while ((match = re.exec(sql)) !== null) {
    const cols = match[1].split(",").map((c) => c.replace(/`/g, "").trim());
    let i = match.index + match[0].length;
    // find end of this INSERT (semicolon at depth 0)
    let depth = 0;
    let inStr = null;
    let end = i;
    for (; end < sql.length; end++) {
      const ch = sql[end];
      if (inStr) {
        if (ch === "\\" && inStr !== "`") {
          end++;
          continue;
        }
        if (ch === inStr) {
          if (inStr === "'" && sql[end + 1] === "'") {
            end++;
            continue;
          }
          inStr = null;
        }
        continue;
      }
      if (ch === "'" || ch === '"') {
        inStr = ch;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth === 0) break;
    }
    const block = sql.slice(i, end);
    const rows = parseValuesBlock(block);
    for (const r of rows) {
      const obj = {};
      cols.forEach((col, idx) => {
        obj[col] = r[idx] ?? null;
      });
      allRows.push(obj);
    }
  }
  return allRows;
}

function statusOrEmpty(s) {
  const ok = ["Longe de Vencer", "Perto de Vencer", "Já Vencido", "Sem Vencimento"];
  if (!s || !ok.includes(s)) return "Sem Vencimento";
  return s;
}

if (!fs.existsSync(sqlPath)) {
  console.error("SQL não encontrado:", sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

const usersRaw = extractInserts(sql, "users");
const foldersRaw = extractInserts(sql, "folders");
const folderSettingsRaw = extractInserts(sql, "folder_settings");
const folderMessagesRaw = extractInserts(sql, "folder_messages");
const whatsappRaw = extractInserts(sql, "whatsapp_messages");
const itemsRaw = extractInserts(sql, "items");
const ticketsRaw = extractInserts(sql, "tickets");

const userIds = new Set(usersRaw.map((u) => String(u.id)));
const stubNeeded = new Set();
for (const f of foldersRaw) {
  if (!userIds.has(String(f.user_id))) stubNeeded.add(String(f.user_id));
}

const PASSWORDS = {
  admin: "admin123",
};

const users = [
  ...usersRaw.map((u) => ({
    id: String(u.id),
    username: String(u.username),
    password: PASSWORDS[u.username] || "123456",
    isAdmin: Boolean(Number(u.is_admin)),
    isActive: u.is_active == null ? true : Boolean(Number(u.is_active)),
  })),
  ...[...stubNeeded].map((id) => ({
    id,
    username: `usuario_${id}`,
    password: "123456",
    isAdmin: false,
    isActive: true,
  })),
];

const folders = foldersRaw.map((f) => ({
  id: String(f.id),
  userId: String(f.user_id),
  type: f.type === "Produto" ? "Produto" : "Cliente",
  name: fixEnc(String(f.name || "")).trim(),
  whatsappMessage: f.whatsapp_message ? fixEnc(String(f.whatsapp_message)) : null,
}));

const folderSettings = folderSettingsRaw.map((s) => ({
  folderId: String(s.folder_id),
  nearDueDays: Number(s.near_due_days) || 3,
  farDueDays: Number(s.far_due_days) || 3,
}));

const folderMessages = folderMessagesRaw.map((m) => ({
  id: String(m.id),
  folderId: String(m.folder_id),
  message: fixEnc(String(m.message || "")),
}));

const whatsappMessages = whatsappRaw.map((m) => ({
  userId: String(m.user_id),
  folderId: String(m.folder_id),
  message: fixEnc(String(m.message || "")),
}));

const items = itemsRaw.map((it) => ({
  id: String(it.id),
  folderId: String(it.folder_id),
  itemId: String(it.item_id ?? "").trim(),
  name: fixEnc(String(it.name || "")).trim(),
  dueDate: it.due_date ? String(it.due_date).slice(0, 10) : null,
  phone: String(it.phone ?? "").trim(),
  price: it.price == null || it.price === "" ? 0 : Number(it.price),
  notes: it.notes ? fixEnc(String(it.notes)) : "",
  createdAt: it.created_at ? String(it.created_at).replace(" ", "T") : null,
  isActive: it.is_active == null ? true : Boolean(Number(it.is_active)),
  status: statusOrEmpty(it.status ? fixEnc(String(it.status)) : ""),
}));

const tickets = ticketsRaw.map((t) => ({
  id: String(t.id),
  userId: String(t.user_id),
  question: fixEnc(String(t.question || "")),
  response: t.response ? fixEnc(String(t.response)) : null,
  createdAt: t.created_at
    ? String(t.created_at).replace(" ", "T")
    : new Date().toISOString(),
  respondedAt: t.responded_at
    ? String(t.responded_at).replace(" ", "T")
    : null,
}));

const seed = {
  users,
  folders,
  folderSettings,
  folderMessages,
  whatsappMessages,
  items,
  tickets,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(seed, null, 2), "utf8");

console.log("Seed gerado:", outPath);
console.log({
  users: users.length,
  folders: folders.length,
  folderSettings: folderSettings.length,
  folderMessages: folderMessages.length,
  whatsappMessages: whatsappMessages.length,
  items: items.length,
  tickets: tickets.length,
});
