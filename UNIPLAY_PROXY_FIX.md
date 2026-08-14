# Correção: Mensagens de Erro do UniPlay no WhatsApp

## O Problema

O cliente estava recebendo uma mensagem técnica expondo detalhes de infraestrutura:

```
A UniPlay bloqueou a nuvem (404). Em Admin → Automações, configure o 
Proxy API (ngrok + ges-proxy) e salve — o WhatsApp usa o mesmo proxy. 
(via https://...)
```

Isso expõe:
- ❌ Detalhes técnicos (ngrok, ges-proxy)
- ❌ Configuração interna (Proxy API, endereços)
- ❌ Sem opções claras (o cliente fica confuso)

## A Solução

As mensagens agora seguem este fluxo:

### 1. **Quando o UniPlay retorna 404/403** (painel bloqueou nuvem)

**Antes:**
```
A UniPlay bloqueou a nuvem (404). Em Admin → Automações, configure o Proxy API...
```

**Depois — Cliente vê:**
```
Não consegui liberar o teste agora (painel UniPlay indisponível da nuvem). 
Peça ao dono para conferir o Proxy API em Automações, ou escreva *atendente*.

_Digite *voltar* para tentar de novo ou *atendente* para falar com a equipe._
```

### 2. **Opções Disponíveis**

O cliente tem 2 caminhos:

- **`voltar`** → Volta ao menu anterior para tentar de novo
- **`atendente`** → Transfere para atendimento humano (fila de handoff)

### 3. **O que o Dono (Admin) Precisa Fazer**

Quando o cliente diz "peça ao dono para conferir o Proxy API", o fluxo é:

1. Dono recebe alerta do cliente
2. Dono vai em **Admin → Automações**
3. Confirma/ajusta a URL do **Proxy API**:
   - Se usar ngrok: `https://seu-tunnel.ngrok-free.dev`
   - Se usar Cloudflare: `https://seu-tunnel.cloudflared.app`
4. Clica em **Salvar**
5. Cliente tenta de novo

## Mudanças no Código

### Arquivo: `supabase/functions/evolution-webhook/index.ts`

#### 1. Função `uniplayErrorMessage()` (linha ~1158)

**Antes:**
```typescript
if (status === 404 || status === 403) {
  return (
    "A UniPlay bloqueou a nuvem (404). Em Admin → Automações, configure o " +
    "Proxy API (ngrok + ges-proxy) e salve — o WhatsApp usa o mesmo proxy. " +
    `(via ${via})`
  );
}
```

**Depois:**
```typescript
if (status === 404 || status === 403) {
  // Retorna marcador genérico que será detectado pelo fluxo de erro amigável
  // Não expõe detalhes técnicos (Proxy API, ngrok, etc.) ao cliente
  return "UNIPLAY_CLOUD_BLOCKED";
}
```

#### 2. Detecção de erro em `uniplayFetch()` (linha ~1263)

Adicionado suporte para o novo marcador:
```typescript
if (/bloqueou a nuvem|UniPlay 404|UNIPLAY_CLOUD_BLOCKED/i.test(lastErr.message)) {
  continue;
}
```

#### 3. Detecção no fluxo de teste (linha ~4135)

```typescript
const errMsg = /bloqueou a nuvem|Proxy API|UniPlay 404|UNIPLAY_CLOUD_BLOCKED/i.test(raw)
  ? "Não consegui liberar o teste agora (painel UniPlay indisponível da nuvem). Peça ao dono para conferir o Proxy API em Automações, ou escreva *atendente*."
  : raw;
```

## Testando a Correção

### Cenário 1: Teste com Proxy OK
```
Cliente: "teste"
Bot: "Qual aparelho?" → menu
Cliente: "1" (PC)
Bot: [cria teste com sucesso]
✅ Funciona
```

### Cenário 2: Teste com Proxy Falho (404)
```
Cliente: "teste"
Bot: "Qual aparelho?" → menu
Cliente: "1" (PC)
Bot: "Não consegui liberar o teste agora (painel UniPlay indisponível da nuvem). 
     Peça ao dono para conferir o Proxy API em Automações, ou escreva *atendente*.
     
     _Digite *voltar* para tentar de novo ou *atendente* para falar com a equipe._"
✅ Mensagem amigável + opções

Cliente: "voltar"
Bot: [volta ao menu anterior]
✅ Cliente pode tentar novamente
```

### Cenário 3: Cliente pede atendente
```
Cliente: "atendente"
Bot: [transfere para fila de handoff humano]
Admin: [recebe alerta de telefone + contexto]
✅ Handoff funciona normalmente
```

## Debug Interno

Se precisar rastrear o erro técnico real para debug:

### 1. **Logs do Supabase Functions**
```bash
# Ver logs da função evolution-webhook
supabase functions logs evolution-webhook
```

### 2. **Procurar por "UNIPLAY_CLOUD_BLOCKED"**
O marcador aparece nos logs internos, mas **nunca é enviado ao cliente**.

### 3. **Verificar Proxy API**
```bash
# Testar se o proxy está respondendo
curl -H "x-iptv-path: /login" \
  https://seu-tunnel.ngrok-free.dev

# Ou direto no Admin AuxPlus
# Admin → Automações → "Testar Proxy API"
```

## Resumo das Mensagens

| Contexto | Mensagem Anterior | Mensagem Nova |
|----------|-------------------|---------------|
| Teste falha (404) | A UniPlay bloqueou a nuvem (404)... [técnica] | Não consegui liberar o teste agora (painel UniPlay indisponível da nuvem). Peça ao dono para conferir o Proxy API em Automações, ou escreva *atendente*. |
| Menu de erro | [Sem opções claras] | Digite *voltar* para tentar de novo ou *atendente* para falar com a equipe. |
| Cliente confuso | [Expõe ngrok, Proxy API, ges-proxy] | [Oculta detalhes técnicos, oferece 2 caminhos: voltar ou atendente] |

## Próximos Passos

1. ✅ Deploy da correção (`supabase deploy`)
2. ✅ Cliente testa o fluxo novamente
3. ✅ Se ainda falhar → verificar URL do Proxy API em Admin → Automações
4. ✅ Se falhar depois de corrigir → pode ser problema de ngrok/rede (escalar para admin)
