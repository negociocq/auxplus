# 🚫 Bloquear Pedidos PIX Permanentemente

## O Problema
Pedidos PIX com erro "Usuário não encontrado" continuavam reaparecendo e enviando mensagens repetidas mesmo após tentativas de limpeza.

## A Solução
Adicionamos um **botão "Bloquear Permanentemente"** direto no AuxPlus, sem precisar acessar Supabase SQL Editor.

## Como Usar

### 1. Abra a aba "Conexões" → "Mercado Pago"
Você verá a seção **"Limpar Pedidos Travados"**

### 2. Identifique os Pedidos com Problema
A interface mostra:
- 🔴 **Usuário não encontrado**: Erro onde o cliente não existe no painel
- 💰 **Pago-não-liberado**: Pagamento aprovado mas não foi liberado

### 3. Bloqueie de Forma Estratégica

#### Opção A: Bloquear um Pedido Específico
Clique no ícone ⚠️ (alerta) ao lado do pedido
- Isso marca como `blocked: true` na Supabase
- Webhook nunca mais reprocessará
- Cliente e histórico permanecem intactos

#### Opção B: Bloquear Todos do Mesmo Erro
Clique em **"Bloquear todos"** (botão com ícone de alerta)
- Para erro "Usuário não encontrado", bloqueia todos com esse erro
- Muito útil se vários pedidos foram criados com dados inválidos

#### Opção C: Remover um Pedido
Clique no ícone 🗑️ (lixo)
- Remove completamente da fila
- Não envia mais mensagens
- Não deixa histórico

## O que Muda?

### Antes (Manual no SQL)
```sql
UPDATE platform_settings
SET value = jsonb_set(...)
WHERE key LIKE 'mp_orders_user_%'
-- ⚠️ Requer acesso ao Supabase SQL Editor
```

### Depois (Botão no AuxPlus)
```
Click ⚠️ → Bloqueado permanentemente ✅
```

## Por que Funciona?

1. **UI Button** → Chama `blockOrder(orderId)` 
2. **blockOrder** → Atualiza Supabase `platform_settings`
3. **Flag `blocked: true`** → Webhook verifica antes de processar
4. **Webhook ignora** → Pedido nunca mais é reprocessado

## Código Adicionado

### `src/components/mp-orders-cleanup.tsx`
- ✅ Adicionado `Lock` icon do lucide-react
- ✅ Adicionado `blocked?: boolean` na interface `MpOrder`
- ✅ Filter agora ignora pedidos já bloqueados: `!o.blocked`
- ✅ Botão ⚠️ chama `blockOrder(order.id)`
- ✅ Tooltip explica "Bloquear permanentemente para nunca mais processar"

### `supabase/functions/evolution-webhook/index.ts`
- ✅ Função `pollAllPending()` verifica: `if ((o as Record<string, any>).blocked) return false;`
- ✅ Pedidos com `blocked: true` são ignorados completamente

## Exemplo Real: Pedido 343924041

**Problema**: Vera (vencida) tem pedido com erro "Usuário 343924041 não encontrado"
- Tentativa 1: Removeu → voltou com webhook
- Tentativa 2: SQL direto → funciona mas exige acesso

**Solução Agora**:
1. Abrir Conexões → Mercado Pago
2. Ver "Usuário 343924041 não encontrado"
3. Clicar ⚠️ 
4. "Bloqueado permanentemente" ✅
5. Pronto! Nunca mais volta, mesmo se painel reinicia

## Teste Agora
```
1. Se houver pedidos em "Limpar Pedidos Travados"
2. Clique no ⚠️ para bloquear
3. Clique em "Recarregar" 
4. Pedido desaparece e não volta mais
```

## Debugging

Se um pedido bloqueado ainda aparecer:

```javascript
// F12 → Console
const key = 'mp_orders_user_SEU_USER_ID';
const data = localStorage.getItem(key);
console.log(JSON.parse(data));
// Procure por: blocked: true, blockedAt: "..."
```

## Próximos Passos Sugeridos

Se o problema persistir mesmo com bloqueio:
1. Verificar se webhook está reativando pedidos antigos
2. Checar logs do painel em localhost:32116
3. Verificar configuração da Evolution (ngrok)
