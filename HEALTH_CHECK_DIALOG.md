# 💬 Diálogo: Health Check do Painel no Menu WhatsApp

## Cenário 1: Cliente com Problema (Painel ONLINE ✅)

```
👤 CLIENTE
Olá, não consigo assistir

🤖 BOT
Entendi. Vamos resolver isso.

*1* — Tentar novamente
*2* — Verificar conexão
*3* — Falar com atendente

👤 CLIENTE
3

🤖 BOT [health check rodando...]
⏳ Verificando... (3 segundos)

✅ Estou conseguindo me comunicar com os servidores.

Vou transferir você para nosso atendimento para investigar o problema.

👤 ATENDENTE (após alguns segundos)
Oi! Como posso ajudar?
```

**O que acontece nos bastidores:**
- Sistema faz `GET http://localhost:32116/ges-api/recargas/credits`
- Retorna **200/400** (online) ✅
- Transfere para atendente
- Atendente sabe: "Painel tá ok, problema é do cliente"

---

## Cenário 2: Cliente com Problema (Painel OFFLINE ❌)

```
👤 CLIENTE
Oi, não tô conseguindo assistir

🤖 BOT
Entendi. Vamos resolver isso.

*1* — Tentar novamente
*2* — Verificar conexão
*3* — Falar com atendente

👤 CLIENTE
3

🤖 BOT [health check rodando...]
⏳ Verificando... (3 segundos)

❌ Estamos com uma instabilidade no serviço no momento.

Nossos técnicos já estão trabalhando no reparo. 
Tente novamente em alguns minutos.

[Bot NÃO transfere para atendente]
[Cliente recebe notificação: esperando 5 minutos antes de tentar novamente]
```

**O que acontece nos bastidores:**
- Sistema faz `GET http://localhost:32116/ges-api/recargas/credits`
- Retorna **502/503** ou timeout (offline) ❌
- **NÃO transfere** para atendente
- Cliente recebe mensagem clara
- Economia de tempo: atendente não precisa responder algo que não consegue resolver

---

## 🎯 Fluxo no Menu WhatsApp

```
┌─────────────────────────────────────────┐
│  CLIENTE CADASTRADO COM PASTA           │
├─────────────────────────────────────────┤
│                                         │
│  Olá! Como posso ajudar?                │
│                                         │
│  *1* — Renovação                        │
│  *2* — Falar com atendente              │
│                                         │
└─────────────────────────────────────────┘

           ↓ Cliente digita "2"

┌─────────────────────────────────────────┐
│  SUB-MENU: Qual o problema?             │
├─────────────────────────────────────────┤
│                                         │
│  *1* — Não consigo assistir             │
│  *2* — Problema de pagamento            │
│  *3* — Outro assunto                    │
│  *0* — Voltar                           │
│                                         │
└─────────────────────────────────────────┘

    ↓ Cliente clica "1" (Não consigo assistir)

    [AQUI ENTRA O HEALTH CHECK! 🎯]

    ↙                          ↘
 PAINEL ONLINE                PAINEL OFFLINE
    ✅                            ❌
    
    "Estou conseguindo        "Estamos com
     comunicar, vou            instabilidade,
     transferir"               já estamos
                               reparando"
     
    ↓                          ↓
  Atendente               Cliente aguarda
  responde
```

---

## 📱 Exemplo Visual: Conversa Completa

### Conversa A: Painel Online (Cliente com problema real)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:32]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Olá! Aqui é o atendimento automático.

👤 Usuário: João123
📅 Vencimento: 15/08/2026

Como posso ajudar?

*1* — Renovação
*2* — Falar com atendente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👤 Cliente  [14:32]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:33]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Qual é o problema?

*1* — Não consigo assistir
*2* — Problema de pagamento
*3* — Outro assunto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👤 Cliente  [14:33]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:34]
 [digitando...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(health check rodando... 🔍)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:34]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Estou conseguindo me comunicar com 
os servidores.

Vou transferir você para nosso atendimento 
para investigar o problema.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👨‍💼 Atendente  [14:35]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oi João! Tudo bem?

Recebi que você não tá conseguindo assistir.
Vamos ver o que tá acontecendo aqui...

*[atendente acessa painel e vê que o
usuário existe, está ativo, mas pode ter
problema de conexão de internet do cliente]*

Qual conexão você tá usando? WiFi ou dados?
```

---

### Conversa B: Painel Offline (Infraestrutura fora)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:32]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Olá! Aqui é o atendimento automático.

👤 Usuário: Maria456
📅 Vencimento: 20/08/2026

Como posso ajudar?

*1* — Renovação
*2* — Falar com atendente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👤 Cliente  [14:32]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:33]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Qual é o problema?

*1* — Não consigo assistir
*2* — Problema de pagamento
*3* — Outro assunto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👤 Cliente  [14:33]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:34]
 [digitando...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(health check rodando... 🔍)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:34]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Estamos com uma instabilidade no 
serviço no momento.

Nossos técnicos já estão trabalhando 
no reparo. Tente novamente em alguns minutos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 👤 Cliente  [14:40]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

tá bom, daqui a pouco tento novamente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🤖 AuxPlus Bot  [14:40]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Perfeito! Fico por aqui. Obrigado! 😊

*[conversa encerrada, sem sobrecarregar
atendente com problema que ele não pode
resolver no momento]*
```

---

## 🎯 Integração no Menu: Onde fica?

```
FLUXO ATUAL:

Cliente cadastrado
      ↓
Menu principal:
  *1* — Renovação
  *2* — Falar com atendente
      ↓
[Cliente digita *2*]
      ↓
🆕 NOVO: Menu de problema
  *1* — Não consigo assistir  ← AQUI ENTRA O HEALTH CHECK!
  *2* — Problema de pagamento
  *3* — Outro assunto
      ↓
[Cliente digita *1*]
      ↓
⚡ HEALTH CHECK AUTOMÁTICO ⚡
  GET /ges-api/recargas/credits (3s)
      ↓
    ↙   ↘
  ONLINE OFFLINE
    ✅    ❌
    
  Resposta 1   Resposta 2
  "Estou      "Instabilidade
   conseguindo" na infraestrutura"
```

---

## 🔧 Implementação Técnica

### Onde o código vai rodar:

```typescript
// supabase/functions/evolution-webhook/index.ts

if (wantsAttendant && session.state === "ask_intent") {
  // Cliente em "Qual é o problema?" e escolheu "Não consigo assistir"
  
  // 🎯 AQUI ENTRA O HEALTH CHECK:
  const panelOk = await isPanelHealthy();
  
  if (panelOk) {
    // Resposta 1: Painel online
    await send("✅ Estou conseguindo me comunicar...");
    // Transfere para atendente
    setHumanPaused(phone, true);
  } else {
    // Resposta 2: Painel offline
    await send("❌ Estamos com uma instabilidade...");
    // NÃO transfere
  }
}
```

---

## 📊 Resumo: O que muda para o cliente?

| Antes | Depois |
|-------|--------|
| Cliente digita "problema" | Cliente digita "problema" |
| ↓ | ↓ |
| Imediatamente transferido para atendente | **Menu: qual é o problema?** |
| (mesmo se painel está fora) | ↓ |
| ❌ Atendente não consegue ajudar | Cliente escolhe *1* |
| (painel offline) | ↓ |
| | **Health check automático** |
| | ↓ |
| | Se online → Transfere com contexto |
| | Se offline → Mensagem clara |

---

## ✅ Benefícios

✅ **Menos chamadas desnecessárias** para atendente (quando painel está fora)  
✅ **Cliente tem resposta imediata** ("Infraestrutura está fora")  
✅ **Atendente economiza tempo** (sabe se é infraestrutura ou cliente)  
✅ **Sem mencionar provedores** (UniPlay, etc) ao cliente  
✅ **Diferencia dois cenários** completamente diferentes  

---

## 🎬 Próximo Passo

Quer que eu:
- [ ] Integre esse menu de "Qual é o problema?" no bot?
- [ ] Adicione opções customizáveis no painel admin?
- [ ] Implemente retry automático?
