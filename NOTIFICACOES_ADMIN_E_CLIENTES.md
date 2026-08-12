# 📱 Sistema de Notificações - Admin + Clientes

**Status:** ✅ Implementado  
**Build:** ✅ Passing  
**Data:** 2026-08-12

---

## 🎯 Resumo das Mudanças

### Antes
- ❌ Notificava TODOS os clientes quando painel voltava online (mesmo que não reportaram problema)
- ❌ Nenhuma notificação para admin quando painel caía
- ❌ Notificava clientes de "pagamento" e "outro" mesmo não tendo problema de assistência

### Agora
- ✅ **Notifica APENAS clientes que reportaram: "não consigo assistir"**
- ✅ **Notifica ADMIN via WhatsApp quando UniPlay cai** (🚨 ALERTA)
- ✅ **Notifica ADMIN quando UniPlay volta online** (✅ RECUPERADO)
- ✅ Ignora clientes que reportaram pagamento ou outro tipo de problema

---

## 📊 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE NO WHATSAPP                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Cliente: "não consigo assistir"                               │
│                    ↓                                            │
│  Bot: "Qual é o problema?"                                     │
│    *1* - Não consigo assistir                                  │
│    *2* - Problema de pagamento                                 │
│    *3* - Outro assunto                                         │
│                    ↓                                            │
│  ┌──────────────────┬──────────────────┬──────────────────┐   │
│  │                  │                  │                  │   │
│  ↓ Cliente: "1"     ↓ Cliente: "2"     ↓ Cliente: "3"   │   │
│                                                          │   │
│ Health Check       [Ignorado]          [Ignorado]       │   │
│                                                          │   │
│ ├─ ONLINE ✅      └─ Responde          └─ Responde     │   │
│ │  "Estou           problema de        outro tipo      │   │
│ │  conseguindo..."  pagamento          de problema     │   │
│ │  → Atendente                                         │   │
│ │                                                       │   │
│ └─ OFFLINE ❌                                          │   │
│    "Estamos com                                        │   │
│     instabilidade..."                                  │   │
│                                                         │   │
│    🔖 REGISTRA:                                        │   │
│    ├─ phone                                            │   │
│    ├─ name                                             │   │
│    ├─ problemType: 'assist'  ← IMPORTANTE             │   │
│    └─ timestamp                                        │   │
│                                                         │   │
│    ⏰ NOTIFICA ADMIN:                                  │   │
│    "🚨 ALERTA: UniPlay está OFFLINE"                  │   │
│                                                         │   │
│    [Cliente aguarda]                                   │   │
│                                                         │   │
│    ⏰ 2 MINUTOS DEPOIS (Edge Function)                 │   │
│                                                         │   │
│    ├─ Painel ainda OFFLINE?                            │   │
│    │  └─ Aguarda próxima verificação                  │   │
│    │                                                   │   │
│    └─ Painel voltou ONLINE?                           │   │
│       │                                                 │   │
│       ├─ ⏰ NOTIFICA ADMIN:                            │   │
│       │  "✅ RECUPERADO: UniPlay está ONLINE"         │   │
│       │                                                 │   │
│       └─ ✅ NOTIFICA CLIENTE:                         │   │
│          "✅ Ótimas notícias! O serviço voltou..."    │   │
│                                                         │   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔔 Notificações do Admin

### Quando Painel Cai (OFFLINE)

**Quem recebe:** Admin do usuário  
**Timing:** Imediato (quando cliente reporta)  
**Mensagem:**

```
🚨 ALERTA: UniPlay está OFFLINE

⏰ Horário: 12/08/2026 00:30:00
📍 Status: Não conseguindo se comunicar com painel
⚠️ Clientes já foram notificados sobre a instabilidade

Verifique e repare o servidor!
```

### Quando Painel Volta (ONLINE)

**Quem recebe:** Admin do usuário  
**Timing:** Imediato (quando edge function detecta)  
**Mensagem:**

```
✅ RECUPERADO: UniPlay está ONLINE

⏰ Horário: 12/08/2026 00:32:00
📍 Status: Painel respondendo normalmente
✨ Clientes estão sendo notificados do retorno
```

---

## 📱 Notificações dos Clientes

### Apenas Clientes de "Assistência"

**Quem recebe:** Clientes que reportaram "não consigo assistir" (resposta *1*)  
**Quem NÃO recebe:**
- ❌ Clientes que reportaram "problema de pagamento" (*2*)
- ❌ Clientes que reportaram "outro" (*3*)

**Timing:** Quando painel volta online (máximo 2 minutos)  
**Mensagem:**

```
✅ Ótimas notícias! O serviço voltou ao normal.

Agora você já consegue assistir normalmente. 
Se o problema persistir, entre em contato 
com nossos atendentes! 😊
```

---

## 🔧 Como Funciona Internamente

### 1. Cliente Reporta Problema

```
Cliente: "não consigo assistir"
   ↓
Bot oferece menu:
  *1* - Não consigo assistir → problemType: 'assist'
  *2* - Pagamento → problemType: 'payment' (IGNORADO)
  *3* - Outro → problemType: 'other' (IGNORADO)
   ↓
Cliente responde: "1"
   ↓
Health Check DO PAINEL
```

### 2. Health Check Detecta Offline

```
isPanelHealthy() → false (502/503 ou timeout 3s)
   ↓
reportClientProblem(userId, phone, name, 'assist')
   ↓
if (problemType !== 'assist') return; // Ignora outros tipos
   ↓
Salva em Supabase:
{
  isDown: true,
  clientsReporting: [
    {
      phone: "5511987654321",
      name: "João",
      problemType: 'assist',  ← APENAS tipo 'assist'
      reportedAt: "..."
    }
  ]
}
   ↓
Envia mensagem para admin:
"🚨 ALERTA: UniPlay está OFFLINE"
```

### 3. Edge Function Monitora

```
Cron: 0 */2 * * * (a cada 2 minutos)
   ↓
checkPanelHealth()
   ↓
if (NOT online) {
  notifyAdminPanelDown() → Envia alerta para admin
  return; // Aguarda próxima vez
}
   ↓
if (online) {
  notifyAdminPanelBack() → Envia "recuperado" para admin
   ↓
  Para cada cliente em clientsReporting:
    if (NOT já notificado):
      sendEvolutionMessage()
      markClientNotified()
}
```

---

## 📁 Arquivos Modificados

### 1. `src/lib/panelDownMonitoring.ts`

```typescript
// Novo campo em PanelDownReport
export interface PanelDownReport {
  phone: string;
  name?: string;
  reportedAt: string;
  userId: string;
  problemType?: 'assist' | 'payment' | 'other'; // ← NOVO
}

// Função atualizada
export async function reportPanelProblem(
  userId: string,
  phone: string,
  clientName?: string,
  problemType?: 'assist' | 'payment' | 'other' // ← NOVO
): Promise<void>
// Agora ignora se problemType !== 'assist'

// Novas funções
export function getPanelDownAdminMessage(): string
export function getPanelBackOnlineAdminMessage(): string
export async function markPanelAsDown(userId: string): Promise<void>
```

### 2. `supabase/functions/panel-monitor/index.ts`

```typescript
// Novo campo na interface
interface PanelDownReport {
  problemType?: 'assist' | 'payment' | 'other'; // ← NOVO
}

// Novas funções
async function notifyAdminPanelDown(supabase, userId): Promise<void>
async function notifyAdminPanelBack(supabase, userId): Promise<void>

// Lógica principal alterada:
if (!isPanelOnline) {
  // ← NOVO: notifica admin quando painel está offline
  for (const state of monitoringStates) {
    const userId = state.key.replace("panel_down_monitoring_", "");
    await notifyAdminPanelDown(supabase, userId);
  }
  return;
}

if (isPanelOnline) {
  // ← NOVO: notifica admin quando painel volta
  for (const state of monitoringStates) {
    const userId = state.key.replace("panel_down_monitoring_", "");
    await notifyAdminPanelBack(supabase, userId);
  }
  // ... resto do código
}
```

### 3. `supabase/functions/evolution-webhook/index.ts`

```typescript
// Função atualizada
async function reportClientProblem(
  client: any,
  userId: string,
  phone: string,
  clientName?: string,
  problemType?: 'assist' | 'payment' | 'other' // ← NOVO
): Promise<void>

// No webhook, quando cliente responde "1":
await reportClientProblem(
  client,
  userId,
  phone,
  clientItem?.name || resellerItem?.name,
  'assist'  // ← PASSA O TIPO
);
```

---

## 🔑 Configuração Necessária

### Para Receber Notificações de Admin

O sistema procura por:

```
Chave: admin_notification_phone_{userId}
Valor: "5511987654321" (número do admin)
```

**Como configurar:**

```
Em Supabase → platform_settings:

INSERT INTO platform_settings (key, value)
VALUES (
  'admin_notification_phone_USER_123',
  '5511987654321'
);
```

Ou via sua dashboard/interface se houver.

---

## 📊 Comportamento Detalhado

### Cenário 1: Cliente reporta "não consigo assistir" + Painel OFFLINE

```
1. Cliente: "não consigo assistir" (responde *1*)
2. Sistema: Health check → OFFLINE
3. Sistema: problemType = 'assist' → REGISTRA ✅
4. Sistema: Notifica admin "🚨 OFFLINE"
5. Cliente: Recebe "Estamos reparando..."
6. Aguarda painel voltar...
7. Painel volta ONLINE
8. Edge function: notifyAdminPanelBack()
9. Edge function: sendWhatsAppToClient()
10. Cliente: Recebe "✅ Voltamos ao normal"
```

### Cenário 2: Cliente reporta "problema de pagamento"

```
1. Cliente: "problema de pagamento" (responde *2*)
2. Sistema: Health check → OFFLINE (ou ONLINE)
3. Sistema: problemType = 'payment'
4. Sistema: [IGNORADO - não registra]
5. Cliente: Recebe resposta normal de pagamento
6. Admin: NÃO recebe notificação de painel
```

### Cenário 3: Cliente reporta "outro"

```
1. Cliente: "outro" (responde *3*)
2. Sistema: Health check → OFFLINE (ou ONLINE)
3. Sistema: problemType = 'other'
4. Sistema: [IGNORADO - não registra]
5. Cliente: Recebe resposta normal de outro problema
6. Admin: NÃO recebe notificação de painel
```

---

## ✅ Checklist

### Implementação

- [x] Campo `problemType` adicionado em `PanelDownReport`
- [x] Função `reportPanelProblem()` filtra apenas `'assist'`
- [x] Funções `notifyAdminPanelDown()` criadas
- [x] Funções `notifyAdminPanelBack()` criadas
- [x] Edge function notifica admin quando painel cai
- [x] Edge function notifica admin quando painel volta
- [x] Webhook passa `problemType: 'assist'` corretamente
- [x] Build passes ✅

### Próximos Passos

- [ ] Configurar número do admin em `platform_settings`
- [ ] Deploy da edge function (já foi antes)
- [ ] Testar notificação quando painel cai
- [ ] Testar notificação quando painel volta
- [ ] Verificar que clientes de "pagamento" e "outro" são ignorados

---

## 🚀 Deploy

### 1. Fazer commit

```bash
git add -A
git commit -m "feat: notificações para admin quando painel cai/volta

- Adiciona problema Type: 'assist' | 'payment' | 'other'
- Apenas registra clientes que reportaram 'não consigo assistir'
- Notifica admin via WhatsApp quando painel fica offline
- Notifica admin quando painel volta online
- Ignora clientes de 'pagamento' e 'outro'"
```

### 2. Deploy edge function

```bash
supabase functions deploy panel-monitor --project-ref jcuehnzaonhdcjbxhadz
```

### 3. Configurar admin phone (uma vez)

```sql
INSERT INTO platform_settings (key, value)
VALUES (
  'admin_notification_phone_USER_123',
  '5511987654321'  -- Seu WhatsApp
);
```

---

## 📞 Suporte

### Testando Localmente

1. Painel offline: Kill o painel ou simular 502
2. Cliente reporta: "não consigo assistir" (responde *1*)
3. Verificar Supabase: Cliente foi registrado com `problemType: 'assist'`
4. Verificar logs: Admin recebeu "🚨 ALERTA"
5. Painel volta: Online
6. Verificar logs: Admin recebeu "✅ RECUPERADO"
7. Cliente recebe: "✅ Voltamos ao normal"

### Logs

```bash
# Ver notificações de admin
supabase functions logs panel-monitor --project-ref jcuehnzaonhdcjbxhadz --tail
```

Procure por:
```
[notifyAdminPanelDown] ✅ Notificação enviada para admin
[notifyAdminPanelBack] ✅ Notificação de recuperação enviada
```

---

**Status:** ✅ Pronto para Deploy  
**Build:** ✅ Passing  
**Próximo:** Fazer commit e deploy
