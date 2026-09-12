import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Adiciona pagamentos de Agosto diretamente no Supabase
 * para um item específico. Use quando "Aplicar no item" não funciona.
 *
 * Uso: node scripts/fix-aug-supabase.mjs <item_id>
 * Ex: node scripts/fix-aug-supabase.mjs 2373
 */
async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error("Uso: node scripts/fix-aug-supabase.mjs <item_id>");
    console.error("Exemplos: 2373 (eronvitor)");
    process.exit(1);
  }

  // Buscar item atual
  const { data: item, error: iErr } = await supabase
    .from("items")
    .select("id,name,notes")
    .eq("id", itemId)
    .single();

  if (iErr) {
    console.error("Erro ao buscar item:", iErr.message);
    process.exit(1);
  }

  console.log(`Item: ${item.name} (${item.id})`);

  // Extrair pagamentos existentes do <!--AXPAY:-->
  let payments = [];
  const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(String(item.notes || ""));
  if (axpayMatch) {
    try {
      payments = JSON.parse(axpayMatch[1]);
    } catch (e) {
      console.warn("Erro ao ler AXPAY:", e.message);
    }
  }

  console.log(`Pagamentos existentes: ${payments.length}`);

  // Pagamentos de Agosto para adicionar
  const augPayments = [
    { paidAt: "2026-08-03", amount: 85 },
    { paidAt: "2026-08-10", amount: 85 },
    { paidAt: "2026-08-14", amount: 85 },
    { paidAt: "2026-08-21", amount: 85 },
    { paidAt: "2026-08-29", amount: 85 },
  ];

  let added = 0;
  for (const p of augPayments) {
    if (!payments.some((ep) => ep.paidAt === p.paidAt && ep.amount === p.amount)) {
      payments.push(p);
      added++;
    }
  }

  if (added === 0) {
    console.log("Pagamentos de Agosto já existem. Nada a fazer.");
    return;
  }

  // Re-embed nas notes
  const notes = String(item.notes || "");
  const cleanNotes = notes.replace(/<!--AXPAY:[\s\S]*?-->/, "").trim();
  const newNotes = cleanNotes
    ? `${cleanNotes}\n<!--AXPAY:${JSON.stringify(payments)}-->`
    : `<!--AXPAY:${JSON.stringify(payments)}-->`;

  // Atualizar no Supabase (somente notes, payments fica no marker)
  const { error: uErr } = await supabase
    .from("items")
    .update({ notes: newNotes })
    .eq("id", itemId);

  if (uErr) {
    console.error("Erro ao atualizar:", uErr.message);
    process.exit(1);
  }

  console.log(`✅ ${added} pagamentos de Agosto adicionados para ${item.name}`);
  console.log(`   Total pagamentos: ${payments.length}`);
  console.log("   No app: limpe o localStorage (F12 → Application → Clear) e recarregue");
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
