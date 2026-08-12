# 🔧 Correções do WhatsApp Bot - Resumo

## Problemas Corrigidos

### ✅ 1. `{dueTime}` não era substituído nas mensagens
**Problema:** O placeholder `{dueTime}` aparecia literal na mensagem ao invés de mostrar a hora real do vencimento.

**Solução:**
- Adicionada função `formatDueTime()` que extrai a hora do vencimento
- Padrão: `23:59:59` se não houver hora específica
- Função passa `dueTime` para `fillClientAskIntent()` e `fillClientRenewPix()`
- Agora a mensagem mostra: `📅 Vencimento: 01/09/2026 23:59:59`

**Código:**
```typescript
function formatDueTime(value?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value || "").trim());
  if (!m) return "23:59:59";
  const h = String(m[4]).padStart(2, "0");
  const min = String(m[5]).padStart(2, "0");
  const s = String(m[6] || "59").padStart(2, "0");
  return `${h}:${min}:${s}`;
}
```

---

### ✅ 2. PIX não gerava quando cliente selecionava "1"
**Problema:** Cliente recebia "Não consegui concluir agora" ao invés de gerar PIX.

**Causa raiz:** As funções de preenchimento não tinham acesso a `dueTime`, causando erro na substituição de variáveis.

**Solução:** Adicionado `dueTime` aos argumentos das funções de preenchimento.

---

### ✅ 3. Opção "2" (Relatar problema) não funcionava corretamente
**Problema:** Quando cliente selecionava "2" para relatar problema, o bot não perguntava qual era o tipo de problema, indo direto para atendentes.

**Solução completa:**
- Adicionado estado `ask_problem_kind` no webhook
- Quando cliente seleciona "2", agora mostra menu:
  ```
  Qual é o problema?
  
  *1* — Não consigo assistir
  *2* — Problema de pagamento
  *3* — Outro assunto
  *0* — Voltar
  ```

- Cada opção é tratada separadamente:
  - **Opção 1** (Não consigo assistir): Faz health check do painel, mostra status
  - **Opção 2** (Problema de pagamento): Avisa e encaminha para atendentes
  - **Opção 3** (Outro assunto): Encaminha para atendentes
  - **Opção 0** (Voltar): Volta ao menu `ask_intent`

---

## Fluxo Completo Corrigido

```
Cliente entra
    ↓
Bot envia: Vencimento + menu (1=Renovar, 2=Problema, 3=Atendentes)
    ↓
Cliente escolhe:

┌─────────┬──────────────┬────────────────┐
│ Opção 1 │  Opção 2     │   Opção 3      │
│ Renovar │  Problema    │  Atendentes    │
└────┬────┴──────┬───────┴────────┬───────┘
     │           │                │
     ↓           ↓                ↓
  Gera PIX   Menu tipo        Vai direto
   com       de problema      para humano
   hora      (ask_problem_kind)
```

---

## Como Resetar para Tarciocq

Para que o tarciocq receba as novas mensagens com todas as correções:

### Opção 1: Usar o botão no AuxPlus
1. Abra **Configurações → Atendimento → UniPlay**
2. Clique em **"Redefinir Configuração do Bot"**
3. Bot carregará as novas mensagens padrão

### Opção 2: Via SQL (se necessário)
```sql
DELETE FROM platform_settings
WHERE key = 'wa_bot_config_user_{USER_ID}';
```

---

## Testes Recomendados

Enviar no WhatsApp para o bot conectado:

### Teste 1: Vencimento com Hora
```
Cliente: (qualquer mensagem)
Bot: 📅 Vencimento: 01/09/2026 23:59:59 ✓
```

### Teste 2: Menu de Problema
```
Cliente: 1 (para renovar)
Bot: (mostra askIntent)

Cliente: 2 (para problema)
Bot: Qual é o problema?
     *1* — Não consigo assistir
     *2* — Problema de pagamento
     *3* — Outro assunto ✓
```

### Teste 3: PIX com Hora
```
Cliente: 1 (renovar)
Bot: ✅ PIX de renovação
     Vencimento atual: 01/09/2026 23:59:59 ✓
```

---

## Arquivos Modificados

- `supabase/functions/evolution-webhook/index.ts`
  - ✅ Adicionada `formatDueTime()`
  - ✅ Atualizada `fillClientAskIntent()` com `dueTime`
  - ✅ Atualizada `fillClientRenewPix()` com `dueTime`
  - ✅ Implementado estado `ask_problem_kind` completo

---

## Commit

```
fix: corrige WhatsApp bot - adiciona dueTime, fluxo de problema e PIX

- Adiciona função formatDueTime() para extrair hora do vencimento
- Passa dueTime para fillClientAskIntent() e fillClientRenewPix()
- Implementa fluxo completo de askProblemKind com menu
- Corrige roteamento para não pular direto para problemHuman

Problemas corrigidos:
✓ {dueTime} agora substitui com hora real
✓ Opção de problema mostra menu antes de encaminhar
✓ PIX funciona com placeholders preenchidos
✓ Fluxo de problema completo
```

Commit: `cd57ee1`
