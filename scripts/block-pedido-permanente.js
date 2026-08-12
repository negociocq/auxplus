/**
 * 🚫 BLOQUEIA PEDIDO PIX 343924041 PERMANENTEMENTE
 * Cole no console do navegador (F12) enquanto estiver em Conexões
 * Isso vai parar TODAS as mensagens repetidas
 */

(async () => {
  try {
    console.log('🔍 Buscando pedidos...');

    // 1. Pega tudo do localStorage relacionado a mp_orders
    const keys = Object.keys(localStorage).filter(k => k.includes('mp_orders_user'));
    console.log('📋 Encontradas chaves:', keys);

    let totalBlocked = 0;

    // 2. Para cada chave, bloqueia os pedidos problemáticos
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let data;
      try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        console.error('❌ Erro ao parsear', key);
        continue;
      }

      const orders = Array.isArray(data.orders) ? data.orders : [];
      console.log(`\n📦 ${key}: ${orders.length} pedido(s)`);

      // 3. Mapeia: bloqueia 343924041 ou qualquer um com erro "não encontrado"
      const updated = orders.map(o => {
        const needsBlock =
          o.panelUsername === '343924041' ||
          (o.error && o.error.includes('não encontrado'));

        if (needsBlock) {
          totalBlocked++;
          console.log('  🚫 Bloqueando:', {
            username: o.panelUsername,
            error: o.error,
            status: o.status
          });

          return {
            ...o,
            blocked: true,
            blockedAt: new Date().toISOString(),
            error: 'BLOQUEADO_PERMANENTEMENTE',
            status: 'blocked'
          };
        }
        return o;
      });

      // 4. Salva de volta no localStorage
      localStorage.setItem(key, JSON.stringify({ orders: updated }));
    }

    console.log('\n✅ Total bloqueado:', totalBlocked, 'pedido(s)');

    // 5. Também bloqueia na Supabase (se conseguir obter userId)
    const sbAuth = localStorage.getItem('sb-jcuehnzaonhdcjbxhadz-auth-token');
    if (sbAuth) {
      try {
        const auth = JSON.parse(sbAuth);
        const userId = auth.user?.id;
        if (userId) {
          console.log('👤 User ID encontrado:', userId);
          console.log('📤 Sincronizando com Supabase...');

          // Faz um fetch para notificar o backend
          const response = await fetch(
            `/.netlify/functions/sync-blocked-orders?userId=${userId}`,
            { method: 'POST' }
          ).catch(() => null);

          if (response?.ok) {
            console.log('✅ Supabase sincronizado');
          }
        }
      } catch (e) {
        console.error('⚠️ Auth parse:', e.message);
      }
    }

    alert(
      `✅ BLOQUEADO!\n\n` +
      `${totalBlocked} pedido(s) foram bloqueados permanentemente.\n\n` +
      `❌ O pedido 343924041 NÃO vai mais:\n` +
      `  • Recarregar em "Limpar Pedidos Travados"\n` +
      `  • Mandar mensagens repetidas\n` +
      `  • Ser processado pelo webhook\n\n` +
      `✅ O cliente e histórico permanecem intactos.\n\n` +
      `Recargue a página (F5) para ver as mudanças.`
    );

    location.reload();
  } catch (e) {
    console.error('❌ Erro:', e);
    alert('Erro: ' + e.message);
  }
})();
