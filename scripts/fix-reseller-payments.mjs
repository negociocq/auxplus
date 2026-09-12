/**
 * Corrige pagamentos 10x maiores em itens de revendedor.
 * Ex.: R$850 → R$85 (quando o padrão é R$8,50/crédito × 10 = R$85).
 *
 * Só corrige valores > 100 que são múltiplos exatos de 85 e
 * cujo quociente é uma potência de 10 (10, 100, 1000...).
 * Isso evita corrigir pagamentos legítimos (ex.: R$170 = 20cr, R$85 = 10cr).
 *
 * Uso: node scripts/fix-reseller-payments.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function is10xError(amount) {
  if (!Number.isFinite(amount) || amount <= 100) return false;
  const v = amount / 85;
  if (!Number.isInteger(v)) return false;
  if (v < 10) return false;
  const log = Math.log10(v);
  return Number.isInteger(log);
}

async function processFolder(folder) {
  let corrected = 0;
  const { data: items, error: iErr } = await supabase
    .from("items")
    .select("id,name,payments,notes")
    .eq("folder_id", folder.id);
  if (iErr) throw iErr;

  if (!items?.length) {
    console.log(`  Pasta ${folder.name}: sem itens.`);
    return 0;
  }

  for (const item of items) {
    let itemCorrected = 0;

    if (item.payments?.length) {
      const newPayments = item.payments.map((p) => {
        const amt = Number(p.amount) || 0;
        if (is10xError(amt)) {
          return { ...p, amount: Math.round((amt / 10) * 100) / 100 };
        }
        return p;
      });
      const count = newPayments.filter(
        (p, i) =>
          is10xError(Number(item.payments[i]?.amount)) &&
          p.amount !== Number(item.payments[i]?.amount),
      ).length;
      if (count > 0) {
        const { error: uErr } = await supabase
          .from("items")
          .update({ payments: newPayments })
          .eq("id", item.id);
        if (uErr) throw uErr;
        itemCorrected += count;
        console.log(
          `  ${item.name || item.id}: ${count} pagamentos corrigidos (campo payments)`,
        );
      }
    }

    const notes = String(item.notes || "");
    const axpayMatch = /<!--AXPAY:([\s\S]*?)-->/.exec(notes);
    if (axpayMatch) {
      try {
        const payments = JSON.parse(axpayMatch[1]);
        const newPayments = payments.map((p) => {
          const amt = Number(p.amount) || 0;
          if (is10xError(amt)) {
            return { ...p, amount: Math.round((amt / 10) * 100) / 100 };
          }
          return p;
        });
        const count = payments.filter((p) => is10xError(Number(p.amount))).length;
        if (count > 0) {
          const clean = notes.replace(axpayMatch[0], "");
          const payload = JSON.stringify(newPayments);
          const newNotes = clean.trim()
            ? `${clean.trim()}\n<!--AXPAY:${payload}-->`
            : `<!--AXPAY:${payload}-->`;
          const { error: uErr } = await supabase
            .from("items")
            .update({ notes: newNotes })
            .eq("id", item.id);
          if (uErr) throw uErr;
          itemCorrected += count;
          console.log(
            `  ${item.name || item.id}: ${count} pagamentos corrigidos (marker AXPAY)`,
          );
        }
      } catch (e) {
        console.warn(`  ${item.name || item.id}: erro ao corrigir notes:`, e.message);
      }
    }

    corrected += itemCorrected;
  }

  return corrected;
}

async function main() {
  console.log("Buscando pastas de revendedor...");
  const { data: folders, error: fErr } = await supabase
    .from("folders")
    .select("id,name,user_id,type")
    .ilike("name", "%revenda%");
  if (fErr) throw fErr;

  if (!folders?.length) {
    console.log(
      "Nenhuma pasta com 'revenda' encontrada. Tentando tipo 'Revendedor'...",
    );
    const { data: folders2, error: f2Err } = await supabase
      .from("folders")
      .select("id,name,user_id,type")
      .eq("type", "Revendedor");
    if (f2Err) throw f2Err;
    if (!folders2?.length) {
      const { data: all, error: aErr } = await supabase
        .from("folders")
        .select("id,name,type");
      if (aErr) throw aErr;
      console.log(
        "Todas as pastas:",
        all?.map((f) => `${f.id}:${f.name} (tipo: ${f.type})`),
      );
      console.log("Ajuste o script manualmente.");
      return;
    }
    await processAll(folders2);
    return;
  }

  console.log(
    "Pastas:",
    folders.map((f) => `${f.id}:${f.name}`),
  );
  await processAll(folders);
}

async function processAll(folders) {
  let totalCorrected = 0;
  let totalItems = 0;
  for (const folder of folders) {
    console.log(`\nPasta: ${folder.name} (id=${folder.id})`);
    const { data: items, error: iErr } = await supabase
      .from("items")
      .select("id")
      .eq("folder_id", folder.id);
    if (iErr) throw iErr;
    const count = items?.length || 0;
    totalItems += count;
    const corrected = await processFolder(folder);
    totalCorrected += corrected;
  }
  console.log(`\n✅ Total: ${totalCorrected} pagamentos corrigidos em ${totalItems} itens (${folders.length} pastas).`);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
