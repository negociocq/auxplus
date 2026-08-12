# 🎯 Sistema de Notificação - Diagrama Visual Completo

## 📱 Experiência do Cliente - Lado a Lado

### Cenário A: Painel ONLINE ✅

```
Cliente                           Sistema
   │                                │
   ├─ "não consigo assistir" ────→ Bot
   │                                │
   │                    Health Check: GET /ges-api/recargas/credits
   │                    Timeout: 3s  ✅ 200 OK
   │                                │
   │ ← "Qual é o problema?" ─────── Bot
   │   *1* Não consigo assistir
   │   *2* Pagamento
   │   *3* Outro
   │
   ├─ "1" ─────────────────────→ Bot
   │                                │
   │                    isPanelHealthy() → TRUE
   │                                │
   │ ← "Estou conseguindo me ─────── Bot
   │   comunicar com o servidor...
   │   Transferindo para atendente"
   │                                │
   │        ┌─ Conexão com Atendimento ─┐
   │        │   (Suporte investiga)      │
   │        └────────────────────────────┘
   │
   │ ← "Olá, qual seu problema?" ─ Atendente
   │
   ├─ "Estava com erro..." ──────→ Atendente
   │
   │ ← "Vou verificar sua conta..." ─ Atendente
   │
   └─ [Atendimento continua normalmente]
```

### Cenário B: Painel OFFLINE ❌

```
Cliente                           Sistema
   │                                │
   ├─ "não consigo assistir" ────→ Bot
   │                                │
   │                    Health Check: GET /ges-api/recargas/credits
   │                    Timeout: 3s  ❌ 502/503 (erro)
   │                                │
   │ ← "Qual é o problema?" ─────── Bot
   │   *1* Não consigo assistir
   │   *2* Pagamento
   │   *3* Outro
   │
   ├─ "1" ─────────────────────→ Bot
   │                                │
   │                    isPanelHealthy() → FALSE
   │                                │
   │                    🔖 reportClientProblem()
   │                    └─ Salva em Supabase:
   │                       {phone, name, timestamp, userId}
   │
   │ ← "❌ Estamos com uma ─────── Bot
   │   instabilidade no serviço.
   │
   │   Nossos técnicos já estão
   │   trabalhando no reparo.
   │
   │   Quando conseguirmos resolver,
   │   enviaremos uma mensagem aqui. 🛠️"
   │
   ├─ [Cliente NÃO é transferido] ─ ✅
   │
   └─ [Cliente aguarda notificação]
                │
                │ ⏰ TEMPO PASSANDO ⏰
                │ (Painel reparando...)
                │
                ↓ 🔧 PAINEL VOLTA ONLINE! 🔧
                │
                │ Edge Function (Cron 2min)
                │ └─ Detecta que painel está online
                │ └─ Busca todos os clientes que reportaram
                │ └─ Envia WhatsApp automático
                │
                ↓
   │ ← "✅ Ótimas notícias!" ────── 🤖 Bot
   │   O serviço voltou ao normal.
   │
   │   Agora você já consegue assistir
   │   normalmente. Se o problema
   │   persistir, entre em contato
   │   com nossos atendentes! 😊
   │
   └─ [Cliente pode assistir novamente]
```

---

## 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (WhatsApp)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Mensagem
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    EVOLUTION WEBHOOK                             │
│            (supabase/functions/evolution-webhook)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Recebe mensagem do cliente                                  │
│  2. Extrai: tipo de problema, telefone, nome                    │
│  3. Chama: isPanelHealthy()                                     │
│     └─ GET http://localhost:32116/ges-api/recargas/credits     │
│     └─ Timeout 3s                                               │
│                                                                 │
│  ┌─────────────────┬──────────────────┐                        │
│  │ PAINEL ONLINE ✅ │ PAINEL OFFLINE ❌ │                        │
│  │                 │                  │                        │
│  ├─ Responde:     │ ├─ Responde:      │                        │
│  │ "Estou         │ │ "Estamos com    │                        │
│  │ conseguindo..." │ │ instabilidade..." │                        │
│  │                 │ │                  │                        │
│  ├─ Transfere     │ ├─ reportClient  │                        │
│  │ para atendente │ │ Problem()       │                        │
│  │ (support)      │ │ (Supabase)      │                        │
│  │                 │ │                  │                        │
│  │ [FIM]           │ └─ Aguarda       │                        │
│  │                 │   notificação   │                        │
│  │                 │   [AGUARDANDO]   │                        │
│  └─────────────────┴──────────────────┘                        │
│                                                                 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ (PAINEL OFFLINE)
                             │ reportClientProblem()
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
│              platform_settings table                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Chave: panel_down_monitoring_USER_123                          │
│                                                                 │
│  Valor:                                                         │
│  {                                                              │
│    isDown: true,                                                │
│    wentDownAt: "2026-08-12T00:15:00Z",                          │
│    clientsReporting: [                                          │
│      {phone: "5511987654321", name: "João", ...},               │
│      {phone: "5511912345678", name: "Maria", ...}               │
│    ],                                                           │
│    notificationsSent: {}                                        │
│  }                                                              │
│                                                                 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ Edge Function (Cron 2min)
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PANEL MONITOR                                  │
│            (supabase/functions/panel-monitor)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Roda A CADA 2 MINUTOS (via cron)                              │
│                                                                 │
│  1. Faz health check: GET /ges-api/recargas/credits             │
│     └─ Se OFFLINE: retorna (nada a fazer)                      │
│     └─ Se ONLINE: processa notificações                        │
│                                                                 │
│  2. Busca TODOS os usuários com monitoramento ativo             │
│     SELECT * FROM platform_settings                            │
│     WHERE key LIKE "panel_down_monitoring_%"                   │
│                                                                 │
│  3. Para cada usuário:                                          │
│     ├─ Carrega lista de clientes que reportaram                │
│     ├─ Para cada cliente NÃO notificado:                       │
│     │  ├─ Busca credentials Evolution (apiUrl, apiKey)         │
│     │  └─ Envia WhatsApp via Evolution API                     │
│     │     POST /message/sendText/{instanceName}                │
│     │     body: {number, text}                                 │
│     │                                                           │
│     └─ Atualiza estado: marca como notificado                  │
│                                                                 │
│  4. Log detalhado de cada operação                              │
│                                                                 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ sendEvolutionMessage()
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     EVOLUTION API                                │
│                 (WhatsApp Provider)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /message/sendText/{instanceName}                          │
│  Headers: apikey: {key}                                         │
│  Body: {number: "5511987654321", text: "✅ Ótimas..."}         │
│                                                                 │
│  Response: 200 OK (enviado) ou erro                             │
│                                                                 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ Envia via WhatsApp
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE RECEBE                                │
│                                                                 │
│  🤖 AuxPlus Bot                                                 │
│                                                                 │
│  ✅ Ótimas notícias! O serviço voltou ao normal.                │
│                                                                 │
│  Agora você já consegue assistir normalmente.                   │
│  Se o problema persistir, entre em contato com                  │
│  nossos atendentes! 😊                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⏱️ Timeline de Eventos

```
T+00:00  Cliente 1 reporta problema
         │
         ├─ Health check: GET /ges-api/recargas/credits
         ├─ Resposta: 502 (painel offline)
         ├─ Sistema registra: phone="5511987654321"
         └─ Bot responde: "Estamos com instabilidade..."
                │
                ↓ [PAINEL REPARANDO]
                │
T+02:00  Edge Function roda (cron)
         │
         ├─ Health check: GET /ges-api/recargas/credits
         ├─ Resposta: 502 (ainda offline)
         └─ Log: "Painel offline, aguardando próxima verificação"
                │
                ↓ [PAINEL AINDA REPARANDO]
                │
T+02:15  Cliente 2 reporta problema
         │
         ├─ Health check: GET /ges-api/recargas/credits
         ├─ Resposta: 502 (painel offline)
         ├─ Sistema registra: phone="5511912345678"
         └─ Bot responde: "Estamos com instabilidade..."
                │
                ↓ [PAINEL AINDA REPARANDO]
                │
T+04:00  Edge Function roda (cron)
         │
         ├─ Health check: GET /ges-api/recargas/credits
         ├─ Resposta: 502 (ainda offline)
         └─ Log: "Painel offline, aguardando próxima verificação"
                │
                ↓ [PAINEL AINDA REPARANDO]
                │
T+06:00  Edge Function roda (cron)
         │
         ├─ Health check: GET /ges-api/recargas/credits
         ├─ Resposta: 502 (ainda offline)
         └─ Log: "Painel offline, aguardando próxima verificação"
                │
                ↓ [PAINEL REPARADO!]
                │
T+08:00  🔧 PAINEL VOLTA ONLINE! 🔧
         │
         └─ Edge Function roda (cron)
            │
            ├─ Health check: GET /ges-api/recargas/credits
            ├─ Resposta: 200 OK (painel online!)
            │
            ├─ Busca monitoramento ativo:
            │  SELECT * FROM platform_settings
            │  WHERE key LIKE "panel_down_monitoring_%"
            │
            ├─ Encontra: panel_down_monitoring_USER_123
            │  clientsReporting: [Cliente1, Cliente2]
            │
            ├─ Para Cliente 1 (5511987654321):
            │  ├─ Carrega credentials Evolution
            │  ├─ POST /message/sendText/wa-instance
            │  │  body: {number: "5511987654321", text: "✅ Ótimas notícias..."}
            │  ├─ Response: 200 OK ✅
            │  └─ Marca como notificado: notificationsSent["5511987654321"] = T+08:05
            │
            ├─ Para Cliente 2 (5511912345678):
            │  ├─ Carrega credentials Evolution
            │  ├─ POST /message/sendText/wa-instance
            │  │  body: {number: "5511912345678", text: "✅ Ótimas notícias..."}
            │  ├─ Response: 200 OK ✅
            │  └─ Marca como notificado: notificationsSent["5511912345678"] = T+08:07
            │
            ├─ Atualiza estado em Supabase:
            │  isDown: false
            │  clientsReporting: [] (limpo)
            │  notificationsSent: {
            │    "5511987654321": "T+08:05",
            │    "5511912345678": "T+08:07"
            │  }
            │
            └─ Log: "✅ Notificações enviadas: 2/2"

T+08:05  📱 Cliente 1 recebe: "✅ Ótimas notícias!..."
T+08:07  📱 Cliente 2 recebe: "✅ Ótimas notícias!..."

✅ SISTEMA COMPLETO!
```

---

## 🔐 Fluxo de Segurança

```
┌─────────────────────┐
│  Cliente no WhatsApp│
└──────────┬──────────┘
           │
           │ Envia mensagem
           ↓
┌─────────────────────────────────────────┐
│  Evolution Webhook (Nossa função)       │
│  ✅ Valida: X-Evolution-Signature       │
│  ✅ Extrai userId, phone, name          │
│  ✅ Valida dados (sanitização)          │
└──────────┬──────────────────────────────┘
           │
           ├─ Health check com timeout
           │  (protege contra painel pendurado)
           │
           ├─ Registra cliente em Supabase
           │  (credentials do usuário)
           │
           └─ Retorna mensagem dinâmica
              (sem expor detalhes do servidor)

┌─────────────────────────────────────────┐
│  Edge Function (Panel Monitor)          │
│  ✅ Usa SUPABASE_SERVICE_ROLE_KEY       │
│  ✅ Health check com timeout            │
│  ✅ Busca credentials por userId        │
│  ✅ Envia via Evolution API com apikey  │
│  ✅ Gera logs detalhados                │
└─────────────────────────────────────────┘
```

---

## 📊 Estrutura de Dados

### Supabase: platform_settings

```javascript
// Quando painel ESTÁ OFFLINE

{
  key: "panel_down_monitoring_USER_123",
  value: {
    isDown: true,
    wentDownAt: "2026-08-12T00:15:00.000Z",
    clientsReporting: [
      {
        phone: "5511987654321",
        name: "João Silva",
        reportedAt: "2026-08-12T00:15:30.000Z",
        userId: "USER_123"
      },
      {
        phone: "5511912345678",
        name: "Maria Santos",
        reportedAt: "2026-08-12T00:16:45.000Z",
        userId: "USER_123"
      }
    ],
    notificationsSent: {}
  },
  updated_at: "2026-08-12T00:15:30.000Z"
}

// Quando painel VOLTA ONLINE (APÓS enviar WhatsApps)

{
  key: "panel_down_monitoring_USER_123",
  value: {
    isDown: false,
    clientsReporting: [], // Limpo após notificar todos
    notificationsSent: {
      "5511987654321": "2026-08-12T00:25:00.000Z",
      "5511912345678": "2026-08-12T00:25:02.000Z"
    },
    lastCheckAt: "2026-08-12T00:25:15.000Z"
  },
  updated_at: "2026-08-12T00:25:15.000Z"
}
```

---

## ✅ Status de Implementação

| Componente | Status | Arquivo |
|-----------|--------|---------|
| Health Check Rápido | ✅ Done | `src/lib/panelHealthCheckFast.ts` |
| Gerenciador de Estado | ✅ Done | `src/lib/panelDownMonitoring.ts` |
| Webhook Integration | ✅ Done | `supabase/functions/evolution-webhook/index.ts` |
| Edge Function Monitor | ✅ Done | `supabase/functions/panel-monitor/index.ts` |
| Bot Messages | ✅ Done | `src/lib/whatsappBotConfig.ts` |
| Build | ✅ Passing | `npm run build` |
| Commits | ✅ Done | `b24cf0d` |

---

## 🚀 Próximos Passos

### 1. Configurar Cron no Supabase

```bash
# Via CLI
supabase functions deploy panel-monitor --project-ref YOUR_PROJECT

# Configurar cron job (2 minutos)
# Via console.supabase.com:
# - Ir para: Edge Functions > panel-monitor > Cron
# - Configurar: 0 */2 * * * (a cada 2 minutos)
```

### 2. Testar Localmente

```bash
# 1. Subir painel localmente (se possível)
# 2. Simular painel offline (matar/pausar serviço)
# 3. Cliente reporta problema no WhatsApp
# 4. Verificar que cliente foi registrado:
#    SELECT * FROM platform_settings 
#    WHERE key LIKE 'panel_down_monitoring_%'
# 5. Subir painel novamente
# 6. Edge function detecta e envia WhatsApp
```

### 3. Monitorar em Produção

```bash
# Visualizar logs:
supabase functions logs panel-monitor --project-ref YOUR_PROJECT

# Buscar por erros:
# - Erros de connection Evolution
# - Clientes não notificados (investigar por quê)
# - Painel não detectado como online (health check timeout?)
```

---

## 🎯 Fluxo Resumido

```
┌────────────────────────────────────────────────┐
│ Cliente reporta problema no WhatsApp           │
├────────────────────────────────────────────────┤
│                                                │
│ 1️⃣  Bot faz health check (3s timeout)         │
│                                                │
│ ❌ OFFLINE         │      ✅ ONLINE            │
│ ├─ Registra        │      ├─ Transfere        │
│ │  cliente         │      │ para atendente    │
│ │  (Supabase)      │      │                   │
│ │                  │      └─ [FIM]            │
│ ├─ Aguarda...      │                          │
│ │                  │                          │
│ └─ [AGUARDANDO]    │                          │
│                    │                          │
│ 2️⃣  Edge Function (Cron 2min) monitora       │
│     ├─ Se ainda offline: retorna (nada)       │
│     └─ Se voltou online:                      │
│        ├─ Busca clientes que reportaram       │
│        ├─ Envia WhatsApp para cada um         │
│        └─ Atualiza estado                     │
│                    │                          │
│ 3️⃣  Cliente recebe: "✅ Voltamos ao normal!"  │
│                                                │
└────────────────────────────────────────────────┘
```

---

**Implementado em:** 2026-08-12  
**Commits:** 3 (health-check, menu-problema, notificação-automática)  
**Build:** ✅ Passing  
**Status:** 🟢 Pronto para Deploy
