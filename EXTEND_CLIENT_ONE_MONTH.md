# 📝 Estender Cliente com 1 Crédito (1 Mês)

**Status:** ✅ Implementado  
**Função:** `extendClientOneMonth()`  
**Build:** ✅ Passing

---

## 🎯 Como Usar

### Forma Simples (Recomendado)

```typescript
import { extendClientOneMonth } from "@/lib/iptvPanelApi";

// Você tem:
// - creds: credenciais do painel UniPlay
// - userId: ID do usuário no painel (remoteUserId)

try {
  const result = await extendClientOneMonth(creds, userId);
  console.log("✅ Cliente estendido por 1 mês!", result);
} catch (error) {
  console.error("❌ Erro ao estender:", error);
}
```

### Na UI (Exemplo em Componente React)

```typescript
import { extendClientOneMonth } from "@/lib/iptvPanelApi";

export function ClientExtendButton({ creds, userId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtend = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await extendClientOneMonth(creds, userId);
      alert("✅ Cliente estendido por 1 mês!");
      // Atualizar dados se necessário
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      alert("❌ Erro: " + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleExtend} disabled={loading}>
      {loading ? "Estendendo..." : "Estender 1 Mês"}
    </button>
  );
}
```

### No Webhook WhatsApp (Edge Function)

```typescript
import { extendClientOneMonth } from "@/lib/iptvPanelApi";

// Quando cliente paga PIX de 1 mês:
try {
  const result = await extendClientOneMonth(panelCreds, remoteUserId);
  console.log("✅ Crédito consumido, cliente estendido");
  await sendMessage(phone, "✅ Seu acesso foi renovado por 1 mês!");
} catch (error) {
  console.log("❌ Falha ao estender:", error);
  await sendMessage(phone, "❌ Erro ao renovar. Contate suporte.");
}
```

---

## 📋 Parâmetros

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `creds` | `IptvPanelCreds` | Credenciais do painel (URL, token, etc) |
| `remoteUserId` | `string \| number` | ID do usuário no painel UniPlay |

**Retorna:** `Promise<unknown>` — resposta da API do painel

---

## ✅ O Que a Função Faz

```
1. Valida parâmetros
2. Chama renewIptvUser() com:
   - months: 1
   - credits: 1
3. Envia requisição ao painel:
   - action: 1 (Extend Line)
   - credits: 1 (1 crédito consumido)
   - reg_password: (se configurado)
4. Registra sucesso/erro em logs
5. Retorna resposta da API
```

---

## 🔍 Logs

### Sucesso
```
[extendClientOneMonth] ✅ Cliente 12345 estendido por 1 mês
```

### Erro
```
[extendClientOneMonth] ❌ Erro ao estender cliente 12345: Connection refused
```

---

## ❌ Problemas Comuns

### Erro: "kind is not defined"
**Solução:** Você estava passando `undefined` para a função.  
**Agora:** Use `extendClientOneMonth()` que já define tudo automaticamente.

### Erro: "Usuário não encontrado"
**Causa:** `remoteUserId` está errado  
**Solução:** Verifique se o ID existe no painel

### Erro: "Insuficiente créditos"
**Causa:** Painel não tem 1 crédito disponível  
**Solução:** Adicionar créditos ao painel

---

## 📊 Exemplo Completo

```typescript
import { extendClientOneMonth, type IptvPanelCreds } from "@/lib/iptvPanelApi";

async function renewClientQuickly() {
  // Credenciais do painel
  const creds: IptvPanelCreds = {
    baseUrl: "http://localhost:32116",
    bearerToken: "seu_token_aqui",
    regPassword: "senha_registro",
  };

  // ID do cliente no painel
  const clientId = "12345";

  try {
    // 🎯 Uma linha para estender!
    const result = await extendClientOneMonth(creds, clientId);
    
    console.log("✅ Sucesso!");
    console.log("Resposta:", result);
    
    // Cliente agora tem +1 mês de acesso
    return { success: true, result };
    
  } catch (error) {
    console.error("❌ Falha:", error);
    return { success: false, error: String(error) };
  }
}

// Usar
const outcome = await renewClientQuickly();
if (outcome.success) {
  // Enviar notificação ao cliente, etc
}
```

---

## 🔗 Funções Relacionadas

Se precisar de **mais customização**, use diretamente:

```typescript
import { renewIptvUser, IPTV_RENEW_OPTIONS } from "@/lib/iptvPanelApi";

// Estender com 3 meses (3 créditos)
await renewIptvUser(creds, userId, IPTV_RENEW_OPTIONS[2]); // 3 meses

// Ou manualmente
await renewIptvUser(creds, userId, {
  months: 3,
  credits: 3,
});
```

---

## ✨ Resumo

**Antes:**
```typescript
// ❌ Erro: kind is not defined
await renewIptvUser(creds, userId, someRandomValue);
```

**Agora:**
```typescript
// ✅ Simples e seguro
await extendClientOneMonth(creds, userId);
```

---

**Status:** ✅ Implementado e testado  
**Build:** ✅ Passing  
**Próximo:** Use em seu código!
