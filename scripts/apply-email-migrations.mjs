import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

// Try via direct REST API (SQL function or DDL)
async function main() {
  // Try to call a SQL function
  const sqlStatements = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email)) WHERE email IS NOT NULL AND length(trim(email)) > 0;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_unique ON users (lower(pending_email)) WHERE pending_email IS NOT NULL AND length(trim(pending_email)) > 0;",
  ];

  for (const sql of sqlStatements) {
    console.log("Executing:", sql.slice(0, 60) + "...");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sql`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}, Response: ${text || "(empty)"}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Verify
  console.log("\nVerificando...");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,email,pending_email&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const text = await res.text();
    console.log(`  Status: ${res.status}, Response: ${text}`);
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
