/**
 * Gera SQL limpo (UTF-8) a partir do seed.json
 * Uso: node scripts/export-clean-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "seed.json"), "utf8"),
);

function esc(v) {
  if (v == null) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\r/g, "\\r").replace(/\n/g, "\\n")}'`;
}

const lines = [];
lines.push("-- AuxPlus dump limpo (UTF-8)");
lines.push("-- Gerado a partir do seed da app Dyad");
lines.push("-- Senhas em texto simples para a app local (não bcrypt)");
lines.push("SET NAMES utf8mb4;");
lines.push("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';");
lines.push("START TRANSACTION;");
lines.push("");

lines.push("INSERT INTO `users` (`id`, `username`, `password`, `is_admin`, `is_active`) VALUES");
lines.push(
  seed.users
    .map(
      (u) =>
        `(${esc(Number(u.id))}, ${esc(u.username)}, ${esc(u.password)}, ${esc(!!u.isAdmin)}, ${esc(u.isActive !== false)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO `folders` (`id`, `user_id`, `type`, `name`, `whatsapp_message`) VALUES",
);
lines.push(
  seed.folders
    .map(
      (f) =>
        `(${esc(Number(f.id))}, ${esc(Number(f.userId))}, ${esc(f.type)}, ${esc(f.name)}, ${esc(f.whatsappMessage ?? null)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO `folder_settings` (`folder_id`, `near_due_days`, `far_due_days`) VALUES",
);
lines.push(
  seed.folderSettings
    .map(
      (s) =>
        `(${esc(Number(s.folderId))}, ${esc(s.nearDueDays)}, ${esc(s.farDueDays)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

if (seed.folderMessages?.length) {
  lines.push(
    "INSERT INTO `folder_messages` (`id`, `folder_id`, `message`) VALUES",
  );
  lines.push(
    seed.folderMessages
      .map(
        (m) =>
          `(${esc(Number(m.id))}, ${esc(Number(m.folderId))}, ${esc(m.message)})`,
      )
      .join(",\n") + ";",
  );
  lines.push("");
}

lines.push(
  "INSERT INTO `items` (`id`, `folder_id`, `item_id`, `name`, `due_date`, `phone`, `status`, `price`, `notes`, `created_at`, `is_active`) VALUES",
);
lines.push(
  seed.items
    .map(
      (i) =>
        `(${esc(Number(i.id))}, ${esc(Number(i.folderId))}, ${esc(i.itemId)}, ${esc(i.name)}, ${esc(i.dueDate)}, ${esc(i.phone)}, ${esc(i.status)}, ${esc(i.price)}, ${esc(i.notes || null)}, ${esc(i.createdAt ? String(i.createdAt).replace("T", " ").slice(0, 19) : null)}, ${esc(i.isActive !== false)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

lines.push(
  "INSERT INTO `tickets` (`id`, `user_id`, `question`, `response`, `created_at`, `responded_at`) VALUES",
);
lines.push(
  seed.tickets
    .map(
      (t) =>
        `(${esc(Number(t.id))}, ${esc(Number(t.userId))}, ${esc(t.question)}, ${esc(t.response)}, ${esc(t.createdAt ? String(t.createdAt).replace("T", " ").slice(0, 19) : null)}, ${esc(t.respondedAt ? String(t.respondedAt).replace("T", " ").slice(0, 19) : null)})`,
    )
    .join(",\n") + ";",
);
lines.push("");

if (seed.whatsappMessages?.length) {
  lines.push(
    "INSERT INTO `whatsapp_messages` (`user_id`, `folder_id`, `message`) VALUES",
  );
  lines.push(
    seed.whatsappMessages
      .map(
        (m) =>
          `(${esc(Number(m.userId))}, ${esc(Number(m.folderId))}, ${esc(m.message)})`,
      )
      .join(",\n") + ";",
  );
  lines.push("");
}

lines.push("COMMIT;");

const out = path.join(root, "legacy", "auxplus_dump_limpo.sql");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("SQL limpo:", out);
console.log({
  users: seed.users.length,
  folders: seed.folders.length,
  items: seed.items.length,
});
