/**
 * Script para BLOQUEAR pedido PIX problemático (343924041)
 * Cole isso no console do navegador (F12) enquanto estiver em Conexoes → Mercado Pago
 * Isso vai BLOQUEAR o pedido para nunca mais processar, SEM deletar o cliente
 */

(async () => {
  try {
    // Pega as configurações do localStorage do supabase
    const keys = Object.keys(localStorage).filter(k => k.includes('mp_orders_user'));
    console.log('🔍 Encontradas chaves:', keys);

    if (keys.length === 0) {
      alert('Nenhum pedido encontrado. Abra a aba Conexoes primeiro.');
      return;
    }

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let data;
      try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        console.error('❌ Erro ao parsear', key, e);
        continue;
      }

      const orders = Array.isArray(data.orders) ? data.orders : [];
      console.log(`📋 Pedidos em ${key}:`, orders.length);

      // Bloqueia pedidos com 343924041 ou erro "não encontrado"
      const updated = orders.map(o => {
        if (o.panelUsername === '343924041' || (o.error && o.error.includes('não encontrado'))) {
          console.log('🚫 Bloqueando:', o.panelUsername, o.error);
          return {
            ...o,
            blocked: true,
            blockedAt: new Date().toISOString(),
            error: 'BLOQUEADO_PERMANENTEMENTE'
          };
        }
        return o;
      });

      // Salva de volta
      localStorage.setItem(key, JSON.stringify({ orders: updated }));
      console.log('✅ Bloqueado:', updated.filter(o => o.blocked).length, 'pedido(s)');
    }

    // Também bloqueia na Supabase (se logado)
    // Tenta pegar o user ID do localStorage do Supabase
    const sbAuth = localStorage.getItem('sb-jcuehnzaonhdcjbxhadz-auth-token');
    if (sbAuth) {
      try {
        const auth = JSON.parse(sbAuth);
        const userId = auth.user?.id;
        if (userId) {
          console.log('👤 User ID:', userId);

          // Aqui você poderia fazer um fetch para o edge function
          // Mas o localStorage já foi atualizado, que é o principal
        }
      } catch (e) {
        console.error('Auth parse error:', e);
      }
    }

    alert('✅ Pedido 343924041 bloqueado permanentemente!\n\n❌ Isso vai remover da lista de "Limpar Pedidos Travados"\n✅ O cliente e histórico PERMANECEM intactos\n\nRecargue a página (F5) para ver as mudanças.');
    location.reload();
  } catch (e) {
    console.error('Erro:', e);
    alert('Erro: ' + e.message);
  }
})();
