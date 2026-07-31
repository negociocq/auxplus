/**
 * Publica seed.json limpo no Supabase (substitui dados das tabelas AuxPlus).
 * Uso: node scripts/push-seed-to-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "seed.json"), "utf8"),
);

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function clearTable(table, idCol = "id") {
  // Supabase exige filtro; gte cobre ids positivos
  const { error } = await supabase.from(table).delete().gte(idCol, -1);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function clearWhatsapp() {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("user_id,folder_id");
  if (error) throw new Error(`whatsapp select: ${error.message}`);
  for (const row of data || []) {
    const { error: delErr } = await supabase
      .from("whatsapp_messages")
      .delete()
      .eq("user_id", row.user_id)
      .eq("folder_id", row.folder_id);
    if (delErr) throw new Error(`whatsapp delete: ${delErr.message}`);
  }
}

async function upsert(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

async function main() {
  console.log("Limpando tabelas...");
  // Ordem: filhos → pais
  await clearWhatsapp();
  await clearTable("folder_messages");
  await clearTable("folder_settings", "folder_id");
  await clearTable("settings", "user_id");
  await clearTable("items");
  await clearTable("tickets");
  await clearTable("folders");
  await clearTable("users");

  console.log("Inserindo users...");
  await upsert(
    "users",
    seed.users.map((u) => ({
      id: Number(u.id),
      username: u.username,
      password: u.password,
      is_admin: !!u.isAdmin,
      is_active: u.isActive !== false,
    })),
  );

  console.log("Inserindo folders...");
  await upsert(
    "folders",
    seed.folders.map((f) => ({
      id: Number(f.id),
      user_id: Number(f.userId),
      type: f.type,
      name: f.name,
      whatsapp_message: f.whatsappMessage ?? null,
    })),
  );

  console.log("Inserindo folder_settings...");
  await upsert(
    "folder_settings",
    (seed.folderSettings || []).map((s) => ({
      folder_id: Number(s.folderId),
      near_due_days: Number(s.nearDueDays) || 3,
      far_due_days: Number(s.farDueDays) || 3,
    })),
  );

  console.log("Inserindo folder_messages...");
  await upsert(
    "folder_messages",
    (seed.folderMessages || []).map((m) => ({
      id: Number(m.id),
      folder_id: Number(m.folderId),
      message: m.message,
    })),
  );

  console.log("Inserindo items...");
  const chunk = 100;
  const itemRows = seed.items.map((i) => ({
    id: Number(i.id),
    folder_id: Number(i.folderId),
    item_id: i.itemId,
    name: i.name,
    due_date: i.dueDate,
    phone: i.phone || null,
    status: i.status || "Sem Vencimento",
    price: i.price || 0,
    notes: i.notes || null,
    created_at: i.createdAt
      ? String(i.createdAt).replace("T", " ").slice(0, 19)
      : null,
    is_active: i.isActive !== false,
  }));
  for (let i = 0; i < itemRows.length; i += chunk) {
    await upsert("items", itemRows.slice(i, i + chunk));
    process.stdout.write(`  items ${Math.min(i + chunk, itemRows.length)}/${itemRows.length}\r`);
  }
  console.log(`\nInserindo tickets...`);
  await upsert(
    "tickets",
    seed.tickets.map((t) => ({
      id: Number(t.id),
      user_id: Number(t.userId),
      question: t.question,
      status: t.response ? "answered" : "pending",
      created_at: t.createdAt
        ? String(t.createdAt).replace("T", " ").slice(0, 19)
        : null,
      response: t.response,
      responded_at: t.respondedAt
        ? String(t.respondedAt).replace("T", " ").slice(0, 19)
        : null,
    })),
  );

  console.log("Inserindo whatsapp_messages...");
  if (seed.whatsappMessages?.length) {
    const { error } = await supabase.from("whatsapp_messages").insert(
      seed.whatsappMessages.map((m) => ({
        user_id: Number(m.userId),
        folder_id: Number(m.folderId),
        message: m.message,
      })),
    );
    if (error) throw new Error(`whatsapp_messages: ${error.message}`);
  }

  const { count: folders } = await supabase
    .from("folders")
    .select("*", { count: "exact", head: true });
  const { count: items } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true });
  const { count: users } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  console.log("OK — Supabase sincronizado:", { users, folders, items });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
