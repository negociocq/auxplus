import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Check users table schema
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .limit(1);
  
  if (error) {
    console.error("Error querying users:", error.message);
    return;
  }
  
  console.log("Sample user:", JSON.stringify(data?.[0], null, 2));

  // Check via REST API for schema
  const { data: schemaData, error: schemaErr } = await supabase
    .rpc("pg_table_size", { table_name: "users" });
  if (schemaErr) {
    console.log("RPC error (expected):", schemaErr.message);
  }

  // Check if we can describe the table via information_schema
  const { data: descData, error: descErr } = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/assert_schema`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ schema_name: "public" }),
    }
  ).then(r => r.json().catch(() => null));
  
  console.log("Schema check:", JSON.stringify(descData));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
