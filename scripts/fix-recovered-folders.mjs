/**
 * Remove pastas "Pasta recuperada *" do Supabase.
 * Itens/mensagens órfãos vão para a pasta IPTV (id 3) do usuário tarciocq.
 *
 * Uso: node scripts/fix-recovered-folders.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const TARGET_FOLDER_ID = 3; // IPTV

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: folders, error } = await supabase
    .from("folders")
    .select("id,name,user_id,type")
    .ilike("name", "Pasta recuperada%");

  if (error) throw error;
  if (!folders?.length) {
    console.log("Nenhuma pasta recuperada encontrada. Nada a fazer.");
    return;
  }

  const ids = folders.map((f) => f.id);
  console.log(
    "Pastas a remover:",
    folders.map((f) => `${f.id}:${f.name}`).join(", "),
  );

  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("id,folder_id")
    .in("folder_id", ids);
  if (itemsErr) throw itemsErr;

  if (items?.length) {
    const { error: moveErr } = await supabase
      .from("items")
      .update({ folder_id: TARGET_FOLDER_ID })
      .in("folder_id", ids);
    if (moveErr) throw moveErr;
    console.log(`Movidos ${items.length} itens → pasta IPTV (${TARGET_FOLDER_ID})`);
  } else {
    console.log("Nenhum item nas pastas recuperadas.");
  }

  const { error: msgErr } = await supabase
    .from("folder_messages")
    .update({ folder_id: TARGET_FOLDER_ID })
    .in("folder_id", ids);
  if (msgErr) console.warn("folder_messages:", msgErr.message);

  // Se já existe mensagem para IPTV, só apaga as órfãs (evita conflito de PK)
  const { error: waErr } = await supabase
    .from("whatsapp_messages")
    .delete()
    .in("folder_id", ids);
  if (waErr) console.warn("whatsapp_messages:", waErr.message);

  const { error: setErr } = await supabase
    .from("folder_settings")
    .delete()
    .in("folder_id", ids);
  if (setErr) console.warn("folder_settings:", setErr.message);

  const { error: delErr } = await supabase.from("folders").delete().in("id", ids);
  if (delErr) throw delErr;

  console.log(`Removidas ${ids.length} pastas recuperadas.`);
  console.log("OK — atualize a página do app.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
