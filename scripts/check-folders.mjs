import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: folders, error } = await supabase
    .from("folders")
    .select("id,name,user_id,type")
    .order("id", { ascending: true });
  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.log("Todas as pastas:");
  for (const f of folders || []) {
    console.log(`  ${f.id}: "${f.name}" (tipo: ${f.type}, user_id: ${f.user_id})`);
  }

  // Also check items in folder 3 (IPTV)
  console.log("\nItens na pasta 3 (IPTV):");
  const { data: items3, error: iErr } = await supabase
    .from("items")
    .select("id,name,folder_id,payments,reseller_credits_bought")
    .eq("folder_id", 3)
    .limit(5);
  if (iErr) console.error("Error:", iErr.message);
  for (const item of items3 || []) {
    console.log(
      `  ${item.id}: ${item.name}, payments: ${JSON.stringify(item.payments)?.slice(0, 200)}, resellerCreditsBought: ${item.reseller_credits_bought}`,
    );
  }

  // Check a specific item that we know has payments
  console.log("\nBuscando itens com payments...");
  const { data: allItems, error: aErr } = await supabase
    .from("items")
    .select("id,name,folder_id,payments")
    .not("payments", "is", null)
    .limit(10);
  if (aErr) console.error("Error:", aErr.message);
  for (const item of allItems || []) {
    console.log(
      `  ${item.id} (folder ${item.folder_id}): ${item.name}, payments: ${JSON.stringify(item.payments)?.slice(0, 300)}`,
    );
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
