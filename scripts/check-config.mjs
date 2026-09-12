import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: settings, error } = await supabase
    .from("settings")
    .select("*");
  if (error) { console.error("Settings error:", error.message); return; }
  console.log("Settings:", JSON.stringify(settings, null, 2));

  const { data: folders, error: fErr } = await supabase
    .from("folders")
    .select("id,name,type,sync_folder_id,sync_resellers_folder_id,created_at")
    .order("id");
  if (fErr) { console.error("Folders error:", fErr.message); return; }
  console.log("\nFolders:", JSON.stringify(folders, null, 2));

  const { data: platform, error: pErr } = await supabase
    .from("platform_settings")
    .select("*");
  if (pErr) { console.error("Platform settings error:", pErr.message); return; }
  console.log("\nPlatform settings:", JSON.stringify(platform, null, 2));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
