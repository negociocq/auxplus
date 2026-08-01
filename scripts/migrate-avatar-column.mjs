import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://jcuehnzaonhdcjbxhadz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8",
);

// Tenta upsert com avatar_url para validar coluna; se falhar, avisa migration SQL
const { data: user } = await supabase
  .from("users")
  .select("id")
  .eq("username", "tarciocq")
  .maybeSingle();

if (!user) {
  console.log("user not found — skip probe");
  process.exit(0);
}

const { error } = await supabase
  .from("users")
  .update({ avatar_url: null })
  .eq("id", user.id);

if (error) {
  console.error(
    "Coluna avatar_url ausente. Rode no SQL Editor:\n",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;",
  );
  console.error(error.message);
  process.exit(1);
}

console.log("OK: coluna avatar_url disponível");
