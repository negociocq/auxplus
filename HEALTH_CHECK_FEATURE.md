# Health Check do Painel - Feature Implementada

## 🎯 O que foi feito

Sistema de **verificação de saúde automática do painel UniPlay** integrada ao atendimento WhatsApp.

Quando o cliente diz **"não consegue assistir"** ou **"tem problema"**:

1. ✅ Sistema faz health check **silencioso** (3 segundos timeout)
2. ✅ Se painel está **ONLINE** → transfere para atendimento humano
3. ✅ Se painel está **OFFLINE** → envia mensagem de instabilidade

**Sem mencionar "UniPlay" ao cliente** — mensagens amigáveis apenas.

---

## 📁 Arquivos Criados/Modificados

### 1. **src/lib/panelHealthCheckFast.ts** (NOVO)
- Função `checkPanelHealth()` — faz requisição rápida (3s timeout) para o painel
- Cache de 5 segundos para evitar múltiplas requisições
- Retorna: `isOnline`, `responseTime`, `timestamp`
- Função `isPanelHealthy()` — verifica status em cache (síncrono)
- Função `getPanelStatusMessage()` — mensagem dinâmica baseada no status

### 2. **src/hooks/useProblemFlowHealthCheck.ts** (NOVO)
- Hook React `useProblemFlowHealthCheck()` para integração em componentes
- Função `checkPanelAndRespond()` — versão assíncrona para webhooks
- Retorna: `isOnline`, `responseMessage`, `shouldTransferToHuman`, `diagnosticInfo`

### 3. **supabase/functions/evolution-webhook/index.ts** (MODIFICADO)
- Adicionadas funções de health check no topo do webhook
- Integração no fluxo: quando cliente diz "problema", executa health check
- **Mensagens dinâmicas:**
  - Se online: "Estou conseguindo me comunicar... vou transferir para atendimento"
  - Se offline: "Estamos com instabilidade... estamos reparando"
- Só transfere para atendimento se painel estiver online

---

## 🔌 Como Funciona (Fluxo)

```
Cliente → "não consegue assistir" / "problema" / "atendente"
         ↓
Bot faz health check (3s)
         ↓
┌─────────────────────────┐
│ Painel ONLINE?          │
└─────────────────────────┘
    ↙                  ↘
  SIM                  NÃO
   ↓                    ↓
Transfere           Envia mensagem
para atendimento    de instabilidade
  (aviso)           ("Reparando...")
   ↓                    ↓
Atendente           Cliente fica
investiga           esperando

```

---

## 🎨 Mensagens Enviadas

### Se Painel ONLINE ✅
```
Estou conseguindo me comunicar com os servidores.

Vou transferir você para nosso atendimento para investigar o problema.
```

### Se Painel OFFLINE ❌
```
Estamos com uma instabilidade no serviço no momento.

Nossos técnicos já estão trabalhando no reparo. Tente novamente em alguns minutos.
```

---

## ⚡ Performance

- **Health check timeout**: 3 segundos (não bloqueia o bot)
- **Cache**: 5 segundos (evita múltiplas requisições no mesmo período)
- **Endpoint testado**: `http://localhost:32116/ges-api/recargas/credits` (GET)

---

## 🧪 Como Testar

### No WhatsApp:
1. Envie qualquer mensagem ao bot
2. Responda com **"2"** ou **"atendente"** ou **"problema"**
3. Observe a resposta:
   - Se painel online: "Estou conseguindo..." + transferência
   - Se painel offline: "Estamos com instabilidade..."

### Debug no console:
```javascript
// Em src/hooks/useProblemFlowHealthCheck.ts
const { handleClientProblem } = useProblemFlowHealthCheck();
const result = await handleClientProblem();
console.log(result);
// { isPanelOnline: boolean, message: string, responseTime: number }
```

---

## 🔄 Integração com Webhook

No `evolution-webhook/index.ts`:
- Quando `wantsAttendant === true`
- Executa `await isPanelHealthy()`
- Se online: transfere + alerta ao atendente
- Se offline: envia mensagem + não transfere

---

## 🎯 Benefícios

✅ **Cliente não fica confuso** com erro técnico sobre UniPlay
✅ **Diferencia dois cenários diferentes:**
   - "Algo errado com sua conta" (painel online, atendente verifica)
   - "Nosso serviço está fora" (painel offline, aguarde)
✅ **Economiza tempo dos atendentes** (sabe se é infra ou cliente)
✅ **Sem mencionar nomes de provedores** ao cliente
✅ **Auto-recuperação** quando painel voltar online (5s de cache)

---

## 📝 Próximos Passos (Opcional)

- [ ] Adicionar retry automático se painel offline
- [ ] Logar tentativas de health check em analytics
- [ ] Mostrar status do painel no admin AuxPlus
- [ ] Notificar dono quando painel fica offline por X minutos

