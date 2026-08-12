/**
 * Script para resetar configuração do WhatsApp bot para o usuário tarciocq
 * Força recarregar as novas mensagens padrão (com problema + hora no vencimento)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetBotConfig() {
  try {
    console.log("🔍 Procurando usuário tarciocq...");

    // Buscar user_id do tarciocq
    const { data: users, error: userError } = await supabase.auth.admin
      .listUsers();

    if (userError) {
      console.error("❌ Erro ao buscar usuários:", userError.message);
      return;
    }

    const user = users?.find((u) => u.email?.includes("tarciocq"));

    if (!user) {
      console.error("❌ Usuário tarciocq não encontrado");
      return;
    }

    console.log(`✅ Usuário encontrado: ${user.id}`);

    const configKey = `wa_bot_config_user_${user.id}`;
    console.log(`🗑️  Deletando configuração: ${configKey}`);

    // Deletar configuração salva
    const { error: deleteError } = await supabase
      .from("platform_settings")
      .delete()
      .eq("key", configKey);

    if (deleteError) {
      console.error("❌ Erro ao deletar:", deleteError.message);
      return;
    }

    console.log("✅ Configuração deletada com sucesso!");
    console.log("📱 Abra o WhatsApp agora e envie '1' para renovar");
    console.log("🎯 O bot carregará as novas mensagens com:");
    console.log("  • Opção de relatar problema");
    console.log("  • Vencimento com hora (ex: 01/09/2026 23:59:59)");
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

resetBotConfig();
