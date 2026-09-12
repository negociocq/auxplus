import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Get column info via Supabase metadata
  const { data, error } = await supabase
    .from("users")
    .select("id, username, password, is_admin, is_active, remember_token, email, pending_email, avatar_url, created_at, updated_at")
    .limit(1);
  
  if (error) {
    console.error("Error:", error.message);
    return;
  }
  
  console.log("User with all possible fields:", JSON.stringify(data?.[0], null, 2));
  console.log("\nKeys present:", Object.keys(data?.[0] || {}));

  // Try to get column names from the table
  const { data: columns, error: colErr } = await supabase
    .rpc("get_table_columns", { table_name: "users" });
  if (colErr) {
    console.log("RPC get_table_columns error:", colErr.message);
  } else {
    console.log("\nColumns via RPC:", JSON.stringify(columns, null, 2));
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
