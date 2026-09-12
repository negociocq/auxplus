import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Check folder 3 (IPTV)
  const { data: folder3, error: fErr } = await supabase
    .from("folders")
    .select("id,name,type")
    .eq("id", 3);
  if (fErr) { console.error("Folder error:", fErr.message); return; }
  console.log("Folder 3:", JSON.stringify(folder3));

  // Get all items in folder 3
  const { data: items, error: iErr } = await supabase
    .from("items")
    .select("id,name,notes,price")
    .eq("folder_id", 3);
  if (iErr) { console.error("Items error:", iErr.message); return; }

  let totalAnnual = 0;
  console.log(`\nItens na pasta IPTV (${items?.length || 0}):`);
  for (const item of items || []) {
    const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(String(item.notes || ""));
    let payments = [];
    if (axpayMatch) {
      try { payments = JSON.parse(axpayMatch[1]); } catch (e) {}
    }
    const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const augPayments = payments.filter((p) => (p.paidAt || "").startsWith("2026-08"));
    const augTotal = augPayments.reduce((s, p) => s + (p.amount || 0), 0);
    
    // Calculate 2026 annual balance
    const jan2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-01"));
    const feb2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-02"));
    const mar2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-03"));
    const apr2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-04"));
    const may2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-05"));
    const jun2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-06"));
    const jul2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-07"));
    const aug2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-08"));
    const sep2026 = payments.filter((p) => (p.paidAt || "").startsWith("2026-09"));
    
    const monthly = {
      Jan: jan2026.reduce((s, p) => s + (p.amount || 0), 0),
      Feb: feb2026.reduce((s, p) => s + (p.amount || 0), 0),
      Mar: mar2026.reduce((s, p) => s + (p.amount || 0), 0),
      Apr: apr2026.reduce((s, p) => s + (p.amount || 0), 0),
      May: may2026.reduce((s, p) => s + (p.amount || 0), 0),
      Jun: jun2026.reduce((s, p) => s + (p.amount || 0), 0),
      Jul: jul2026.reduce((s, p) => s + (p.amount || 0), 0),
      Ago: aug2026.reduce((s, p) => s + (p.amount || 0), 0),
      Set: sep2026.reduce((s, p) => s + (p.amount || 0), 0),
    };
    
    const annual = Object.values(monthly).reduce((s, v) => s + v, 0);
    totalAnnual += annual;
    
    console.log(
      `  ${item.name || item.id}: ${payments.length} payments, R$${total.toFixed(2)} total, 2026: R$${annual.toFixed(2)}`,
    );
    console.log(`    Monthly 2026: Jan=${monthly.Jan}, Feb=${monthly.Feb}, Mar=${monthly.Mar}, Apr=${monthly.Apr}, May=${monthly.May}, Jun=${monthly.Jun}, Jul=${monthly.Jul}, Ago=${monthly.Ago}, Set=${monthly.Set}`);
  }
  
  console.log(`\n📊 TOTAL ANNUAL 2026 (IPTV folder): R$${totalAnnual.toFixed(2)}`);
  console.log(`   (User reported: R$ 38 092,66)`);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
