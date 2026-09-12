import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: items, error } = await supabase
    .from("items")
    .select("id,name,folder_id,price,due_date,notes");
  
  if (error) { console.error("Error:", error.message); return; }
  
  console.log("Total items in Supabase: " + (items?.length || 0));
  
  const byFolder = {};
  let grandTotal = 0;
  let grandTotalAllPayments = 0;
  
  for (const item of items || []) {
    const folderId = String(item.folder_id);
    if (!byFolder[folderId]) byFolder[folderId] = { total: 0, count: 0, withPayments: 0 };
    byFolder[folderId].count++;
    
    const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(String(item.notes || ""));
    if (axpayMatch) {
      try {
        const payments = JSON.parse(axpayMatch[1]);
        const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
        byFolder[folderId].total += total;
        if (total > 0) byFolder[folderId].withPayments++;
        grandTotalAllPayments += total;
        
        if (item.due_date) {
          const dueDate = String(item.due_date).slice(0, 7);
          const counted = payments.filter((p) => (p.paidAt || "").slice(0, 7) <= dueDate);
          grandTotal += counted.reduce((s, p) => s + (p.amount || 0), 0);
        } else {
          grandTotal += total;
        }
      } catch (e) {}
    }
  }
  
  console.log("\n=== BY FOLDER (total payments) ===");
  for (const fid of Object.keys(byFolder).sort()) {
    const data = byFolder[fid];
    console.log("Folder " + fid + ": " + data.count + " items, " + data.withPayments + " with payments, total=R$" + data.total.toFixed(2));
  }
  
  console.log("\n📊 Grand total (all payments): R$" + grandTotalAllPayments.toFixed(2));
  console.log("📊 Grand total (until due date): R$" + grandTotal.toFixed(2));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
