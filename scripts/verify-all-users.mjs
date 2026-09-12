import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Test PATCH for all affected users
  for (const id of [1, 12, 16, 17, 18]) {
    const { error } = await supabase
      .from("users")
      .update({ pending_email: null })
      .eq("id", id)
      .select("id");
    
    if (error) {
      console.log(`User ${id}: FAILED - ${error.message}`);
    } else {
      console.log(`User ${id}: OK`);
    }
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
