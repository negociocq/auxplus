/**
 * Script de limpeza força para remover pedido específico
 * Copia este código e executa no console do navegador
 */

(async () => {
  const { createClient } = await import('@supabase/supabase-js');

  const supabase = createClient(
    'https://jcuehnzaonhdcjbxhadz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8'
  );

  try {
    // Seu user ID aqui
    const userId = prompt('Qual é seu User ID? (veja em Créditos ou console)');
    if (!userId) return;

    const { data } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', `mp_orders_user_${userId}`)
      .maybeSingle();

    if (!data?.value) {
      alert('Nenhum pedido encontrado');
      return;
    }

    const parsed = typeof data.value === 'string'
      ? JSON.parse(data.value)
      : data.value;

    const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    console.log('Pedidos encontrados:', orders);

    // Remove pedidos com "343924041" ou "não encontrado"
    const filtered = orders.filter(o =>
      o.panelUsername !== '343924041' &&
      !o.error?.includes('não encontrado')
    );

    console.log('Removendo:', orders.length - filtered.length, 'pedido(s)');

    await supabase
      .from('platform_settings')
      .update({ value: JSON.stringify({ orders: filtered }) })
      .eq('key', `mp_orders_user_${userId}`);

    alert(`✅ ${orders.length - filtered.length} pedido(s) removido(s)!`);
    location.reload();
  } catch (e) {
    console.error('Erro:', e);
    alert('Erro: ' + e.message);
  }
})();
