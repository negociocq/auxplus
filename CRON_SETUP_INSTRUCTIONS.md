# ⏰ Configuração de Cron Job - Panel Monitor

**Status:** Edge Function deployada ✅  
**Próximo passo:** Configurar cron job via dashboard

---

## 🎯 Objetivo

Fazer a edge function `panel-monitor` rodar **automaticamente a cada 2 minutos** para:
1. Verificar se o painel está online
2. Se voltou do offline: enviar WhatsApp para todos os clientes que reportaram

---

## 📋 Passo a Passo - Via Dashboard Supabase

### 1. Acessar Supabase Dashboard

```
URL: https://supabase.com/dashboard/project/jcuehnzaonhdcjbxhadz/functions
```

### 2. Localizar a Function `panel-monitor`

Na lista de Edge Functions, procure por: **panel-monitor**

Você verá:
```
📦 panel-monitor
   Status: Active
   Method: POST
   URL: https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor
```

### 3. Configurar Cron Job

Clique em **panel-monitor** → Aba **Cron Settings** (ou similar)

Você verá um formulário como:
```
┌─────────────────────────────────────────┐
│ Cron Expression                         │
│ ┌─────────────────────────────────────┐ │
│ │ 0 */2 * * *                         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Próxima execução: Cada 2 minutos       │
│                                         │
│ [✓] Habilitado                          │
│                                         │
│ [ Salvar ]                              │
└─────────────────────────────────────────┘
```

### 4. Inserir Cron Expression

Cole a seguinte expressão:

```
0 */2 * * *
```

**Explicação:**
- `0` = Minuto 0 (top of the minute)
- `*/2` = A cada 2 minutos
- `* * *` = Todas as horas, dias, meses

**Alternativas:**
```
# A cada minuto (não recomendado, pode sobrecarregar)
* * * * *

# A cada 5 minutos
0 */5 * * *

# A cada 10 minutos
0 */10 * * *

# A cada 30 minutos
0 */30 * * *

# A cada hora
0 * * * *

# Todos os dias às 00:00
0 0 * * *

# Todos os dias às 02:00
0 2 * * *

# De segunda a sexta, de hora em hora
0 * * * 1-5
```

### 5. Salvar Configuração

Clique em **[Salvar]** ou **[Update]**

**Você verá:**
```
✅ Cron job configurado com sucesso!
   Expressão: 0 */2 * * *
   Próxima execução: em ~2 minutos
   Status: Ativo
```

---

## ✅ Verificar Configuração

### Via Dashboard

1. Ir para: **Edge Functions → panel-monitor → Cron Settings**
2. Confirmar que cron está **Enabled/Ativo**
3. Confirmar expressão: `0 */2 * * *`

### Via CLI

```bash
# Listar edge functions
supabase functions list --project-ref jcuehnzaonhdcjbxhadz

# Você verá:
# panel-monitor | https://...functions/v1/panel-monitor | Active
```

### Verificar Execução

Aguarde ~2 minutos e verifique os logs:

```bash
# Ver logs em tempo real
supabase functions logs panel-monitor --project-ref jcuehnzaonhdcjbxhadz --tail

# Você deve ver:
# [Edge Function] panel-monitor iniciada às 2026-08-12T00:32:00.000Z
# [monitorPanelAndNotify] Verificando saúde do painel...
# [monitorPanelAndNotify] Painel ONLINE ✅ (ou OFFLINE ❌)
```

---

## 🔧 Teste Manual de Execução

Se quiser testar a function **agora** sem esperar o cron:

### Via cURL

```bash
curl -X POST \
  https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

**Resposta esperada:**
```json
{
  "ok": true,
  "message": "Monitoramento iniciado",
  "timestamp": "2026-08-12T00:31:00.000Z"
}
```

### Via Postman

1. Abrir Postman
2. Novo request: **POST**
3. URL: `https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor`
4. Headers:
   - `Authorization: Bearer YOUR_ANON_KEY`
   - `Content-Type: application/json`
5. Click: **Send**

---

## 📊 Timeline de Execução

Após configurar cron `0 */2 * * *`:

```
00:00 → Edge Function executa ✅
00:02 → Edge Function executa ✅
00:04 → Edge Function executa ✅
00:06 → Edge Function executa ✅
00:08 → Edge Function executa ✅
...
23:58 → Edge Function executa ✅
```

**Cada execução:**
- Verifica painel (3s timeout)
- Se offline: log e retorna
- Se online: busca clientes, envia WhatsApps, atualiza Supabase

---

## 🆘 Troubleshooting

### Problema: Cron não está aparecendo na interface

**Solução:**
1. Fazer refresh da página (F5)
2. Logout e login novamente
3. Ou usar API REST diretamente (veja abaixo)

### Problema: Cron não está rodando

**Verificar:**
```bash
# 1. Ver logs
supabase functions logs panel-monitor --project-ref jcuehnzaonhdcjbxhadz

# 2. Se não houver logs, pode ser que:
#    - Cron não está configurado
#    - Function não está deployada
#    - Project está em sleep mode (Supabase hobby plan)

# 3. Testar manualmente
curl -X POST \
  https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Problema: Erro 401/403

**Causa:** Falta bearer token ou token inválido

**Solução:**
```bash
# Usar anon key do projeto
export ANON_KEY="seu_anon_key_aqui"

curl -X POST \
  https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor \
  -H "Authorization: Bearer $ANON_KEY"
```

### Problema: Function timeout (>60s)

**Causa:** Muitos clientes para notificar ou Evolution API lenta

**Solução:**
1. Aumentar limite de timeout na function
2. Otimizar notificações (enviar em paralelo)
3. Aumentar frequência de cron (1 minuto ao invés de 2)

---

## 📌 Variáveis de Ambiente Necessárias

A function precisa destas env vars em **Project Settings → Edge Functions**:

```
SUPABASE_URL=https://jcuehnzaonhdcjbxhadz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

EVOLUTION_API_URL=https://evolution.seu-host.com
EVOLUTION_API_KEY=seu-api-key-aqui
EVOLUTION_INSTANCE_NAME=seu-instance-name
```

**Como configurar:**
1. Ir para: **Project Settings → Edge Functions → panel-monitor**
2. Seção: **Environment Variables**
3. Adicionar cada uma das acima
4. Click: **Save**

---

## ✨ Status Atual

| Item | Status |
|------|--------|
| Code | ✅ Pronto |
| Build | ✅ Passou |
| Deploy Function | ✅ **Feito agora** |
| Env Vars | ⏳ Confirmar |
| Cron Job | ⏳ **Próximo passo** |
| Teste | ⏳ Após cron |

---

## 🚀 Próximos Passos

### Imediato

1. ✅ ~~Deploy edge function~~ **[FEITO]**
2. 📋 Configurar env vars (se ainda não feito)
3. ⏰ **Configurar cron job: `0 */2 * * *`**
4. 🧪 Testar execução

### Depois

5. Simular painel offline
6. Cliente reporta problema
7. Painel volta online
8. Cliente recebe WhatsApp automático
9. 🎉 Sistema ao vivo!

---

## 📞 Suporte

Se tiver dúvidas:

- **Docs Supabase Cron:** https://supabase.com/docs/guides/functions/scheduling
- **Cron Expression Helper:** https://crontab.guru/
- **Supabase Discord:** https://discord.gg/supabase

---

**Salvo em:** 2026-08-12T00:31:04Z  
**Status:** 🟡 Aguardando configuração de cron job
