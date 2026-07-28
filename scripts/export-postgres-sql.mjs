/**
 * Gera SQL PostgreSQL (Neon/Supabase/Dyad) a partir do seed.json
 * Uso: node scripts/export-postgres-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "seed.json"), "utf8"),
);

// Pastas referenciadas por items/messages mas ausentes no dump original
const folderIds = new Set(seed.folders.map((f) => String(f.id)));
const orphanFolderIds = new Set();
for (const item of seed.items) {
  if (!folderIds.has(String(item.folderId))) orphanFolderIds.add(String(item.folderId));
}
for (const m of seed.folderMessages || []) {
  if (!folderIds.has(String(m.folderId))) orphanFolderIds.add(String(m.folderId));
}
for (const m of seed.whatsappMessages || []) {
  if (!folderIds.has(String(m.folderId))) orphanFolderIds.add(String(m.folderId));
}
const ownerFallback = seed.users.find((u) => u.username === "tarciocq")?.id || seed.users[0]?.id || "1";
const folders = [
  ...seed.folders,
  ...[...orphanFolderIds].map((id) => ({
    id,
    userId: String(ownerFallback),
    type: "Cliente",
    name: `Pasta recuperada ${id}`,
    whatsappMessage: null,
  })),
];

function esc(v) {
  if (v == null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function ts(v) {
  if (!v) return "NULL";
  const s = String(v).replace("T", " ").replace(/Z$/, "").slice(0, 19);
  return esc(s);
}

const lines = [];
lines.push("-- AuxPlus — PostgreSQL (UTF-8)");
lines.push("-- Compatível com Neon / Supabase / Dyad");
lines.push("-- Sem backticks (MySQL). Rode este arquivo no SQL Editor.");
lines.push("BEGIN;");
lines.push("");
lines.push("DROP TABLE IF EXISTS whatsapp_messages CASCADE;");
lines.push("DROP TABLE IF EXISTS folder_messages CASCADE;");
lines.push("DROP TABLE IF EXISTS folder_settings CASCADE;");
lines.push("DROP TABLE IF EXISTS settings CASCADE;");
lines.push("DROP TABLE IF EXISTS items CASCADE;");
lines.push("DROP TABLE IF EXISTS tickets CASCADE;");
lines.push("DROP TABLE IF EXISTS folders CASCADE;");
lines.push("DROP TABLE IF EXISTS users CASCADE;");
lines.push("DROP TYPE IF EXISTS folder_type CASCADE;");
lines.push("DROP TYPE IF EXISTS item_status CASCADE;");
lines.push("DROP TYPE IF EXISTS ticket_status CASCADE;");
lines.push("");
lines.push("CREATE TYPE folder_type AS ENUM ('Produto', 'Cliente');");
lines.push(
  "CREATE TYPE item_status AS ENUM ('Longe de Vencer', 'Perto de Vencer', 'Já Vencido', 'Sem Vencimento');",
);
lines.push("CREATE TYPE ticket_status AS ENUM ('pending', 'answered');");
lines.push("");

lines.push(`CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  remember_token VARCHAR(255)
);`);
lines.push("");

lines.push(`CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type folder_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  whatsapp_message TEXT
);`);
lines.push("");

lines.push(`CREATE TABLE folder_messages (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL,
  message TEXT NOT NULL
);`);
lines.push("");

lines.push(`CREATE TABLE folder_settings (
  folder_id INTEGER PRIMARY KEY,
  near_due_days INTEGER NOT NULL,
  far_due_days INTEGER NOT NULL
);`);
lines.push("");

lines.push(`CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  due_date DATE,
  phone VARCHAR(32),
  status item_status NOT NULL DEFAULT 'Sem Vencimento',
  price NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);`);
lines.push("");

lines.push(`CREATE TABLE settings (
  user_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL DEFAULT 0,
  near_due_days INTEGER NOT NULL,
  far_due_days INTEGER NOT NULL,
  PRIMARY KEY (user_id, folder_id)
);`);
lines.push("");

lines.push(`CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  status ticket_status DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP,
  response TEXT,
  responded_at TIMESTAMP
);`);
lines.push("");

lines.push(`CREATE TABLE whatsapp_messages (
  user_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  message TEXT,
  PRIMARY KEY (user_id, folder_id)
);`);
lines.push("");

lines.push(
  "INSERT INTO users (id, username, password, is_admin, is_active) VALUES",
);
lines.push(
  seed.users
    .map(
      (u) =>
        `(${Number(u.id)}, ${esc(u.username)}, ${esc(u.password)}, ${esc(!!u.isAdmin)}, ${esc(u.isActive !== false)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO folders (id, user_id, type, name, whatsapp_message) VALUES",
);
lines.push(
  folders
    .map(
      (f) =>
        `(${Number(f.id)}, ${Number(f.userId)}, ${esc(f.type)}, ${esc(f.name)}, ${esc(f.whatsappMessage ?? null)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO folder_settings (folder_id, near_due_days, far_due_days) VALUES",
);
lines.push(
  seed.folderSettings
    .map(
      (s) =>
        `(${Number(s.folderId)}, ${Number(s.nearDueDays)}, ${Number(s.farDueDays)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

if (seed.folderMessages?.length) {
  lines.push("INSERT INTO folder_messages (id, folder_id, message) VALUES");
  lines.push(
    seed.folderMessages
      .map(
        (m) =>
          `(${Number(m.id)}, ${Number(m.folderId)}, ${esc(m.message)})`,
      )
      .join(",\n") + ";",
  );
  lines.push("");
}

const validStatuses = new Set([
  "Longe de Vencer",
  "Perto de Vencer",
  "Já Vencido",
  "Sem Vencimento",
]);

lines.push(
  "INSERT INTO items (id, folder_id, item_id, name, due_date, phone, status, price, notes, created_at, is_active) VALUES",
);
lines.push(
  seed.items
    .map((i) => {
      const status = validStatuses.has(i.status) ? i.status : "Sem Vencimento";
      const created = i.createdAt
        ? String(i.createdAt).replace("T", " ").slice(0, 19)
        : null;
      return `(${Number(i.id)}, ${Number(i.folderId)}, ${esc(i.itemId)}, ${esc(i.name)}, ${esc(i.dueDate)}, ${esc(i.phone || null)}, ${esc(status)}, ${Number(i.price) || 0}, ${esc(i.notes || null)}, ${ts(created)}, ${esc(i.isActive !== false)})`;
    })
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO tickets (id, user_id, question, status, created_at, response, responded_at) VALUES",
);
lines.push(
  seed.tickets
    .map((t) => {
      const status = t.response ? "answered" : "pending";
      return `(${Number(t.id)}, ${Number(t.userId)}, ${esc(t.question)}, ${esc(status)}, ${ts(t.createdAt)}, ${esc(t.response)}, ${ts(t.respondedAt)})`;
    })
    .join(",\n") + ";",
);
lines.push("");

if (seed.whatsappMessages?.length) {
  lines.push(
    "INSERT INTO whatsapp_messages (user_id, folder_id, message) VALUES",
  );
  lines.push(
    seed.whatsappMessages
      .map(
        (m) =>
          `(${Number(m.userId)}, ${Number(m.folderId)}, ${esc(m.message)})`,
      )
      .join(",\n") + ";",
  );
  lines.push("");
}

// sequences for future inserts
const max = (arr, key) =>
  Math.max(0, ...arr.map((x) => Number(x[key]) || 0));

lines.push(
  `SELECT setval(pg_get_serial_sequence('users','id'), GREATEST(${max(seed.users, "id")}, 1));`,
);
lines.push("-- IDs manuais: criar sequences auxiliares se for inserir novos registros");
lines.push(
  `CREATE SEQUENCE IF NOT EXISTS users_id_seq OWNED BY users.id;`,
);
lines.push(
  `CREATE SEQUENCE IF NOT EXISTS folders_id_seq OWNED BY folders.id;`,
);
lines.push(
  `CREATE SEQUENCE IF NOT EXISTS items_id_seq OWNED BY items.id;`,
);
lines.push(
  `CREATE SEQUENCE IF NOT EXISTS tickets_id_seq OWNED BY tickets.id;`,
);
lines.push(
  `CREATE SEQUENCE IF NOT EXISTS folder_messages_id_seq OWNED BY folder_messages.id;`,
);
lines.push(
  `ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');`,
);
lines.push(
  `ALTER TABLE folders ALTER COLUMN id SET DEFAULT nextval('folders_id_seq');`,
);
lines.push(
  `ALTER TABLE items ALTER COLUMN id SET DEFAULT nextval('items_id_seq');`,
);
lines.push(
  `ALTER TABLE tickets ALTER COLUMN id SET DEFAULT nextval('tickets_id_seq');`,
);
lines.push(
  `ALTER TABLE folder_messages ALTER COLUMN id SET DEFAULT nextval('folder_messages_id_seq');`,
);
lines.push(`SELECT setval('users_id_seq', ${max(seed.users, "id")});`);
lines.push(`SELECT setval('folders_id_seq', ${max(folders, "id")});`);
lines.push(`SELECT setval('items_id_seq', ${max(seed.items, "id")});`);
lines.push(`SELECT setval('tickets_id_seq', ${max(seed.tickets, "id")});`);
lines.push(
  `SELECT setval('folder_messages_id_seq', ${max(seed.folderMessages || [], "id") || 1});`,
);
lines.push("");
lines.push("COMMIT;");

const out = path.join(root, "legacy", "auxplus_postgres.sql");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("PostgreSQL SQL:", out);
console.log({
  users: seed.users.length,
  folders: folders.length,
  stubFolders: orphanFolderIds.size,
  items: seed.items.length,
  tickets: seed.tickets.length,
});
