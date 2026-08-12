# 🛠️ Sistema Completo de Notificação - Painel Offline/Online

## 📊 Fluxo Visual Completo

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
│  Cliente: "1"                                                  │
│                    ↓                                            │
│  ⚡ HEALTH CHECK DO PAINEL (3s) ⚡                             │
│                                                                 │
│    ┌──────────────────────┬──────────────────────┐             │
│    │                      │                      │             │
│    ↓ PAINEL ONLINE ✅    ↓ PAINEL OFFLINE ❌   │             │
│                          │                      │             │
│  Bot:                     │  Bot:                │             │
│  "Estou conseguindo       │  "Estamos com        │             │
│   comunicar..."           │   instabilidade..."  │             │
│                           │                      │             │
│  Transfere para           │  🔖 REGISTRA CLIENTE │             │
│  atendente                │     - phone          │             │
│                           │     - nome           │             │
│  ✅ Atendente investi-    │     - timestamp      │             │
│     ga o problema         │                      │             │
│                           │  Cliente aguarda     │             │
│    ┌────────────────────────────────────────┐   │             │
│    │ ENQUANTO ISSO, EDGE FUNCTION MONITORA  │   │             │
│    │ A CADA 2 MINUTOS:                      │   │             │
│    │                                        │   │             │
│    │ 1. GET /ges-api/recargas/credits       │   │             │
│    │ 2. Timeout 3s                          │   │             │
│    │ 3. Se 502/503 → painel offline         │   │             │
│    │ 4. Se 200/400 → painel online          │   │             │
│    └────────────────────────────────────────┘   │             │
│                           │                      │             │
│                      ⏰ TEMPO PASSANDO ⏰        │             │
│                    [painel reparando...]         │             │
│                           │                      │             │
│                           ↓                      │             │
│                   🔧 PAINEL VOLTA! 🔧           │             │
│                           │                      │             │
│                           ↓                      │             │
│                  ✅ NOTIFICAÇÃO AUTO ✅          │             │
│                                                  │             │
│  🤖 Bot:                                        │             │
│  "✅ Ótimas notícias!                           │             │
│   O serviço voltou ao normal.                   │             │
│                                                  │             │
│   Agora você já consegue assistir normalmente.  │             │
│   Se o problema persistir, entre em contato!" │             │
│                           │                      │             │
│                      ✅ ENVIADO! ✅              │             │
│                                                 │             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Ciclo Completo de Detecção e Notificação

### Fase 1: Cliente reporta problema (PAINEL ESTÁ OFFLINE)

```
WEBHOOK: evolution-webhook/index.ts
    │
    ├─ Cliente envia: "2" (problema)
    │
    ├─ isPanelHealthy() → false (502/503)
    │
    ├─ Bot responde:
    │  "❌ Estamos com uma instabilidade...
    │   Nossos técnicos já estão trabalhando...
    │   Quando conseguirmos resolver, enviaremos uma mensagem aqui. 🛠️"
    │
    ├─ reportClientProblem(userId, phone, name)
    │  │
    │  └─ Salva em Supabase:
    │     platform_settings:
    │     {
    │       key: "panel_down_monitoring_USER_123",
    │       value: {
    │         isDown: true,
    │         wentDownAt: "2026-08-12T00:15:00Z",
    │         clientsReporting: [
    │           {
    │             phone: "5511987654321",
    │             name: "João Silva",
    │             reportedAt: "2026-08-12T00:15:30Z",
    │             userId: "USER_123"
    │           }
    │         ],
    │         notificationsSent: {}
    │       }
    │     }
    │
    └─ Retorna: { ok: true, action: "problem_panel_offline" }

[Cliente NOT transferido para atendente]
[Cliente aguarda mensagem]
```

### Fase 2: Edge Function monitora periodicamente

```
CRON: A cada 2 minutos

panel-monitor/index.ts roda:
    │
    ├─ checkPanelHealth()
    │  └─ GET http://localhost:32116/ges-api/recargas/credits
    │     └─ Timeout 3s
    │        └─ Se sucesso → online ✅
    │        └─ Se 502/503/timeout → offline ❌
    │
    ├─ Se painel ainda offline:
    │  └─ Log: "Painel offline, aguardando próxima verificação"
    │  └─ Retorna (nada a fazer)
    │
    └─ Se painel voltou ONLINE:
       │
       ├─ Busca TODOS os usuários com monitoramento ativo:
       │  SELECT * FROM platform_settings
       │  WHERE key LIKE "panel_down_monitoring_%"
       │
       ├─ Para cada userId:
       │  │
       │  ├─ Carrega estado: platform_settings.panel_down_monitoring_USER_123
       │  │  └─ clientsReporting: [João, Maria, Pedro...]
       │  │
       │  ├─ Para cada cliente em clientsReporting:
       │  │  │
       │  │  ├─ if (não foi notificado):
       │  │  │  │
       │  │  │  ├─ sendEvolutionMessage():
       │  │  │  │  │
       │  │  │  │  ├─ POST {EVOLUTION_API}/message/sendText/{instance}
       │  │  │  │  │
       │  │  │  │  ├─ body: {
       │  │  │  │  │   number: "5511987654321",
       │  │  │  │  │   text: "✅ Ótimas notícias!
       │  │  │  │  │         O serviço voltou ao normal.
       │  │  │  │  │         Agora você já consegue assistir normalmente.
       │  │  │  │  │         Se o problema persistir,
       │  │  │  │  │         entre em contato com nossos atendentes! 😊"
       │  │  │  │  │ }
       │  │  │  │  │
       │  │  │  │  └─ Envia ✅
       │  │  │  │
       │  │  │  ├─ Marca como notificado:
       │  │  │  │  notificationsSent["5511987654321"] = "2026-08-12T00:25:00Z"
       │  │  │  │
       │  │  │  └─ Log: "✅ Enviado para 5511987654321"
       │  │  │
       │  │  └─ else: (já foi notificado, ignora)
       │  │
       │  ├─ Atualiza estado em Supabase:
       │  │  platform_settings.panel_down_monitoring_USER_123:
       │  │  {
       │  │    isDown: false,
       │  │    clientsReporting: [],
       │  │    notificationsSent: {
       │  │      "5511987654321": "2026-08-12T00:25:00Z",
       │  │      "5511912345678": "2026-08-12T00:25:02Z"
       │  │    }
       │  │  }
       │  │
       │  └─ Log: "Notificações enviadas: 2/2"
       │
       └─ Retorna: { ok: true, message: "Monitoramento iniciado" }
```

### Fase 3: Clientes recebem notificação

```
WHATSAPP:

🤖 AuxPlus Bot  [00:25]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Ótimas notícias! O serviço voltou ao normal.

Agora você já consegue assistir normalmente. 
Se o problema persistir, entre em contato 
com nossos atendentes! 😊

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📁 Estrutura de Dados - Supabase

### Tabela: `platform_settings`

```json
{
  "key": "panel_down_monitoring_USER_123",
  "value": {
    "isDown": false,
    "wentDownAt": "2026-08-12T00:15:00.000Z",
    "clientsReporting": [
      {
        "phone": "5511987654321",
        "name": "João Silva",
        "reportedAt": "2026-08-12T00:15:30.000Z",
        "userId": "USER_123"
      },
      {
        "phone": "5511912345678",
        "name": "Maria Santos",
        "reportedAt": "2026-08-12T00:16:45.000Z",
        "userId": "USER_123"
      }
    ],
    "notificationsSent": {
      "5511987654321": "2026-08-12T00:25:00.000Z",
      "5511912345678": "2026-08-12T00:25:02.000Z"
    },
    "lastCheckAt": "2026-08-12T00:25:15.000Z"
  },
  "updated_at": "2026-08-12T00:25:15.000Z"
}
```

---

## ⚙️ Componentes Técnicos

### 1. **src/lib/panelDownMonitoring.ts**
```typescript
exportable functions:
- reportPanelProblem(userId, phone, name)
  └─ Registra cliente quando painel está offline

- getPanelMonitoringState(userId)
  └─ Carrega estado atual de monitoramento

- markPanelBackOnline(userId)
  └─ Retorna lista de clientes para notificar

- markClientNotified(userId, phone)
  └─ Marca cliente como já notificado

- resetPanelMonitoring(userId)
  └─ Reseta estado (após notificar todos)

- getRepairInProgressMessage()
  └─ Mensagem padrão quando painel está offline

- getPanelBackOnlineMessage()
  └─ Mensagem padrão quando painel volta online
```

### 2. **supabase/functions/panel-monitor/index.ts**
```typescript
Edge Function que:
- Roda a cada 2 minutos (via cron)
- Faz health check do painel
- Se online: busca todos os usuários com monitoramento
- Envia WhatsApp para cada cliente não notificado
- Atualiza estado em Supabase
- Gera logs detalhados
```

### 3. **supabase/functions/evolution-webhook/index.ts** (modificado)
```typescript
Integração:
- isPanelHealthy() → Verifica saúde do painel
- reportClientProblem() → Registra cliente
- getPanelStatusMessage() → Mensagem dinâmica
```

---

## 🎯 Fluxo de Estados

```
Estado 1: PAINEL ONLINE (Normal)
  └─ isDown: false
  └─ clientsReporting: []
  └─ notificationsSent: {}

           ↓ Painel fica offline

Estado 2: PAINEL OFFLINE (Reparando)
  └─ isDown: true
  └─ wentDownAt: 2026-08-12T00:15:00Z
  └─ clientsReporting: [cliente1, cliente2, ...]
  └─ notificationsSent: {}

  [Edge Function monitora a cada 2 min]

           ↓ Painel volta online

Estado 3: PAINEL ONLINE (Notificando)
  └─ isDown: false
  └─ clientsReporting: [] (limpo)
  └─ notificationsSent: {
       "5511987654321": "2026-08-12T00:25:00Z",
       "5511912345678": "2026-08-12T00:25:02Z"
     }

  [Guarda histórico de notificações por 7 dias]
```

---

## 🔔 Mensagens Enviadas

### Quando Painel ESTÁ OFFLINE:
```
❌ Estamos com uma instabilidade no serviço no momento.

Nossos técnicos já estão trabalhando no reparo.

Quando conseguirmos resolver, enviaremos uma mensagem aqui. 🛠️
```

### Quando Painel VOLTA ONLINE:
```
✅ Ótimas notícias! O serviço voltou ao normal.

Agora você já consegue assistir normalmente. 
Se o problema persistir, entre em contato com nossos atendentes! 😊
```

---

## 📊 Timeline de Exemplo

```
00:15:00 → Cliente João reporta problema
           Painel está OFFLINE (502)
           ✅ João registrado
           
00:15:30 → Cliente Maria reporta problema
           Painel ainda OFFLINE
           ✅ Maria registrada
           
00:17:00 → Edge Function roda (cron 2min)
           isPanelHealthy() → false (ainda offline)
           Log: "Painel offline, aguardando próxima verificação"
           
00:19:00 → Edge Function roda novamente
           isPanelHealthy() → false (ainda offline)
           Nada a fazer
           
00:21:00 → Edge Function roda novamente
           isPanelHealthy() → false (ainda offline)
           Nada a fazer
           
00:23:00 → 🔧 PAINEL VOLTA ONLINE! 🔧
           Edge Function roda
           isPanelHealthy() → true ✅
           
           Busca: SELECT * FROM platform_settings
                  WHERE key LIKE "panel_down_monitoring_%"
           
           Encontrado: panel_down_monitoring_USER_123
           
           clientsReporting: [João, Maria]
           
           ├─ João: enviar WhatsApp
           │  └─ POST /message/sendText
           │  └─ ✅ Enviado
           │  └─ notificationsSent["joão"] = 00:23:05
           │
           └─ Maria: enviar WhatsApp
              └─ POST /message/sendText
              └─ ✅ Enviado
              └─ notificationsSent["maria"] = 00:23:07
           
           Log: "Notificações enviadas: 2/2"
           
00:23:05 → João recebe: "✅ Ótimas notícias! Voltamos ao normal..."
00:23:07 → Maria recebe: "✅ Ótimas notícias! Voltamos ao normal..."
           
           ✅ AMBOS NOTIFICADOS! ✅
```

---

## ✅ Checklist de Implementação

- [x] Criar `panelDownMonitoring.ts` com gerenciador de estado
- [x] Criar `panel-monitor/index.ts` (edge function de monitoramento)
- [x] Integrar `reportClientProblem()` no webhook
- [x] Integrar mensagens dinâmicas no webhook
- [x] Compilação sem erros
- [x] Commits feitos

---

## 🚀 Deploy Checklist

- [ ] Configurar cron no Supabase: `0 */2 * * *` (a cada 2 min)
- [ ] Testar health check localmente
- [ ] Testar envio de WhatsApp com número de teste
- [ ] Verificar se credentials Evolution estão corretas
- [ ] Monitorar logs da edge function nos primeiros 24h
- [ ] Documentar no dashboard do admin (opcional)

---

## 🐛 Debug & Logs

### Monitorar Edge Function:
```bash
supabase functions logs panel-monitor --local
```

### Verificar estado de monitoramento:
```sql
SELECT * FROM platform_settings 
WHERE key LIKE 'panel_down_monitoring_%';
```

### Limpar estado de teste:
```sql
DELETE FROM platform_settings 
WHERE key LIKE 'panel_down_monitoring_%';
```

---

## 🎯 Resumo Final

| Fase | O Que Acontece | Onde |
|------|----------------|------|
| **Cliente Reporta** | Bot detecta painel offline, registra cliente | Webhook |
| **Aguardando** | Edge Function monitora a cada 2 min | Cron |
| **Painel Volta** | Edge Function detecta online | Cron |
| **Notificação** | WhatsApp automático para cada cliente | Evolution API |
| **Confirmação** | Marca como notificado, reseta estado | Supabase |

---

**Status**: ✅ Implementado e commitado (hash: b24cf0d)
**Build**: ✅ Passou sem erros
**Pronto para**: Deploy ao Supabase
