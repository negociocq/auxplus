/**
 * Corrige divergência IPTV vs PHP original (datas renovadas + órfão Vitinho).
 * Uso: node scripts/fix-iptv-status-drift.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const updates = [
  { id: 1024, item_id: "54632310", due_date: "2026-08-29" }, // jeanzinho
  { id: 2270, item_id: "325667211", due_date: "2026-08-29" }, // Jones
  { id: 2298, item_id: "38985055", due_date: "2026-08-29" }, // Thamires
  {
    id: 1516,
    item_id: "25506168",
    due_date: "2026-08-29",
    name: "Jorgin de alex do esposo de andreia",
  },
];

async function main() {
  for (const row of updates) {
    const { error } = await supabase.from("items").update(row).eq("id", row.id);
    if (error) throw new Error(`update ${row.id}: ${error.message}`);
    console.log("ok update", row.id, row.item_id, row.due_date);
  }

  const { error: delErr } = await supabase.from("items").delete().eq("id", 1076);
  if (delErr) throw new Error(`delete Vitinho: ${delErr.message}`);
  console.log("ok delete Vitinho (1076)");

  const { error: encErr } = await supabase
    .from("items")
    .update({ name: "Victória Mota✨ De Heron Depósito" })
    .eq("id", 2327);
  if (encErr) console.warn("encoding Victória:", encErr.message);
  else console.log("ok encoding Victória");

  const { data, error } = await supabase
    .from("items")
    .select("id,item_id,due_date,name")
    .eq("folder_id", 3);
  if (error) throw error;
  console.log("IPTV items:", data?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
