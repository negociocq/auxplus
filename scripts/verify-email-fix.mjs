import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Check if columns exist now
  console.log("Test 1: SELECT email, pending_email from users...");
  const { data, error } = await supabase
    .from("users")
    .select("id, username, email, pending_email")
    .limit(3);
  
  if (error) {
    console.error("  FAILED:", error.message);
  } else {
    console.log("  OK:", JSON.stringify(data, null, 2));
  }

  // Test PATCH
  console.log("\nTest 2: PATCH users SET email, pending_email...");
  const { data: patchData, error: patchErr } = await supabase
    .from("users")
    .update({ email: "test@test.com", pending_email: null })
    .eq("id", 1)
    .select("id, email, pending_email");
  
  if (patchErr) {
    console.error("  FAILED:", patchErr.message);
  } else {
    console.log("  OK:", JSON.stringify(patchData));
  }

  // Restore original test
  console.log("\nTest 3: Restore test data...");
  const { error: restoreErr } = await supabase
    .from("users")
    .update({ email: null, pending_email: null })
    .eq("id", 1);
  
  if (restoreErr) {
    console.error("  FAILED:", restoreErr.message);
  } else {
    console.log("  OK - restored");
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
