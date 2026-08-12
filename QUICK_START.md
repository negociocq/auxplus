# ⚡ Quick Start - Sistema de Notificação

**Status:** ✅ Pronto agora  
**Tempo para ativar:** ~2 minutos

---

## 🎯 Em 30 Segundos

```
┌─ Cliente reporta problema ─┐
│                            │
└─→ Bot: Health Check ✅     │
    ├─ Painel ONLINE ✅      │ → Transfere atendente
    └─ Painel OFFLINE ❌     │ → "Estamos reparando..."
                             │
                    ⏰ 2 MINUTOS DEPOIS
                             │
    Painel volta ONLINE       │
         ↓                    │
    Bot envia: "✅ Voltamos!" │
         ↓                    │
    [CLIENTE NOTIFICADO] ✅   │
```

---

## 🚀 Ativar Agora (2 min)

### Passo 1: Dashboard Supabase

```
Ir para: https://supabase.com/dashboard/project/jcuehnzaonhdcjbxhadz/functions
```

### Passo 2: Procurar `panel-monitor`

Clique em: **panel-monitor** (já está deployada ✅)

### Passo 3: Configurar Cron

```
Seção: Cron Settings
Cole: 0 */2 * * *
Clique: Salvar
```

✅ **PRONTO!** Sistema está ativo.

---

## ✅ Verificar Funcionamento

### Logs em tempo real

```bash
supabase functions logs panel-monitor --project-ref jcuehnzaonhdcjbxhadz --tail
```

Você verá a cada 2 minutos:
```
[Edge Function] panel-monitor iniciada às ...
[monitorPanelAndNotify] Painel ONLINE ✅
```

### Testar manualmente agora

```bash
curl -X POST \
  https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/panel-monitor \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

---

## 📊 Fluxo Pronto

| Fase | O Que Faz | Tempo |
|------|-----------|-------|
| Cliente reporta | Bot faz health check | <1s |
| Painel OFFLINE | Registra cliente, avisa "estamos reparando" | <1s |
| Edge function roda | Verifica painel a cada 2 min | cron |
| Painel ONLINE | Detecta + envia WhatsApp | ~2-5s |
| Cliente notificado | Recebe "✅ Voltamos!" | imediato |

---

## 📁 Arquivos de Referência

Se precisar de detalhes:

- **README_SISTEMA_NOTIFICACAO.md** ← Leia primeiro
- **NOTIFICATION_SYSTEM_COMPLETE.md** ← Fluxo técnico
- **SISTEMA_VISUAL.md** ← Diagramas
- **CRON_SETUP_INSTRUCTIONS.md** ← Passo-a-passo detalhado
- **DEPLOYMENT_CHECKLIST.md** ← Troubleshooting

---

## 🎉 Status

```
✅ Código: Pronto
✅ Build: Passing
✅ Edge Function: Deployada
⏳ Cron Job: Aguardando você (2 min)
```

---

**Próximo:** Configure o cron job acima.  
**Depois:** Sistema está ao vivo! 🚀
