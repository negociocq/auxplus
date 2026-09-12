import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Items in folder 3 with due dates
  const { data: items, error } = await supabase
    .from("items")
    .select("id,name,due_date,notes")
    .eq("folder_id", 3)
    .not("due_date", "is", null);

  if (error) { console.error("Error:", error.message); return; }
  
  console.log(`Itens com vencimento na pasta IPTV: ${items?.length || 0}`);
  
  let totalWithDue = 0;
  for (const item of items || []) {
    const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(String(item.notes || ""));
    let payments = [];
    if (axpayMatch) {
      try { payments = JSON.parse(axpayMatch[1]); } catch (e) {}
    }
    const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const dueDate = String(item.due_date || "").slice(0, 7);
    const paymentsUntilDue = payments.filter((p) => (p.paidAt || "").slice(0, 7) <= dueDate);
    const totalUntilDue = paymentsUntilDue.reduce((s, p) => s + (p.amount || 0), 0);
    totalWithDue += totalUntilDue;
    
    if (total > 0) {
      console.log(
        `  ${item.name || item.id}: due=${dueDate}, payments=${payments.length}, total=R$${total.toFixed(2)}, counted=${totalUntilDue.toFixed(2)}`,
      );
    }
  }
  
  console.log(`\n📊 Total counted (payments until due date): R$${totalWithDue.toFixed(2)}`);
  
  // Also check total for ALL items in folder 3
  const { data: allItems, error: aErr } = await supabase
    .from("items")
    .select("id,name,due_date,notes,price");
  if (aErr) { console.error("Error2:", aErr.message); return; }
  
  let grandTotal = 0;
  let grandTotalAllPayments = 0;
  for (const item of allItems || []) {
    const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(String(item.notes || ""));
    if (!axpayMatch) continue;
    try {
      const payments = JSON.parse(axpayMatch[1]);
      const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
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
  
  console.log(`\n📊 All items total (all payments): R$${grandTotalAllPayments.toFixed(2)}`);
  console.log(`📊 All items total (until due date): R$${grandTotal.toFixed(2)}`);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
