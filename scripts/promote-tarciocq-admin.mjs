import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://jcuehnzaonhdcjbxhadz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8",
);

const { data: users, error: listErr } = await supabase
  .from("users")
  .select("id,username,is_admin");
if (listErr) throw listErr;
console.log("users before", users);

const tarcio = users.find(
  (u) => String(u.username).toLowerCase() === "tarciocq",
);
const admin = users.find((u) => String(u.username).toLowerCase() === "admin");
if (!tarcio) throw new Error("tarciocq not found");

const { error: upErr } = await supabase
  .from("users")
  .update({ is_admin: true })
  .eq("id", tarcio.id);
if (upErr) throw upErr;
console.log("tarciocq is_admin=true");

if (admin) {
  const adminId = admin.id;
  const { data: folders } = await supabase
    .from("folders")
    .select("id")
    .eq("user_id", adminId);
  const folderIds = (folders || []).map((f) => f.id);
  if (folderIds.length) {
    await supabase.from("items").delete().in("folder_id", folderIds);
    await supabase.from("folder_settings").delete().in("folder_id", folderIds);
    await supabase.from("folder_messages").delete().in("folder_id", folderIds);
    await supabase.from("folders").delete().in("id", folderIds);
  }
  await supabase.from("tickets").delete().eq("user_id", adminId);
  await supabase.from("whatsapp_messages").delete().eq("user_id", adminId);
  const { error: delErr } = await supabase
    .from("users")
    .delete()
    .eq("id", adminId);
  if (delErr) throw delErr;
  console.log("admin deleted", adminId);
} else {
  console.log("admin user already absent");
}

const { data: after } = await supabase
  .from("users")
  .select("id,username,is_admin");
console.log("users after", after);
