# Fix: CORS bloqueado no Cloudflare Tunnel → UniPlay

## O Problema

Quando você usa o Cloudflare Tunnel (`https://ozone-assessed-rom-translation.trycloudflare.com`) em produção:

```
Access to fetch at 'https://ozone-assessed-rom-translation.trycloudflare.com/recargas/credits' 
from origin 'https://auxplus.vercel.app' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Localhost funciona** porque o Vite proxy (`/ges-api`) redireciona diretamente para `http://127.0.0.1:8787`.

**Produção falha** porque o Cloudflare Tunnel não estava aplicando os headers CORS corretamente em requisições OPTIONS (preflight).

## A Solução

### 1. **Refatorar CORS no ges-proxy-server.mjs**

Extrair a lógica de CORS para uma função reutilizável que:
- Aplica headers em **todas as respostas** (sucesso, erro, OPTIONS)
- Inclui `Vary: Origin` (importante para CDN/tunnel cache)
- Inclui `Access-Control-Max-Age: 86400` (nega cache do browser por 24h)

**Arquivo:** `scripts/ges-proxy-server.mjs`

```javascript
/** Aplica headers CORS necessários para Cloudflare Tunnel + navegadores */
function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-iptv-authorization, x-iptv-path, apikey, ngrok-skip-browser-warning",
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Max-Age", "86400");
}
```

### 2. **Por que isso resolve?**

- **Preflight OPTIONS**: Browser envia `OPTIONS /path` antes de POST/PUT/DELETE
  - Antes: headers CORS não eram aplicados em erro
  - Depois: `applyCorsHeaders()` aplica em **todas as respostas**

- **Cloudflare Tunnel**: Às vezes reescreve/remove headers
  - `Vary: Origin` força o tunnel a não cache respostas CORS
  - `Access-Control-Max-Age` reduz preflights repetidos

- **Erro 502/timeout**: Agora também têm CORS
  - Browser não confunde "falta de CORS" com "proxy down"

## Como Testar

### Em Localhost (funciona normalmente)
```bash
npm run dev
# Vai em http://localhost:5173
# Requisições para /ges-api/recargas/credits funcionam
```

### Em Produção (Cloudflare Tunnel)
```bash
# Terminal 1: Proxy local
node scripts/ges-proxy-server.mjs
# → [ges-proxy] http://127.0.0.1:8787

# Terminal 2: Cloudflare Tunnel
cloudflared tunnel --url http://127.0.0.1:8787
# → https://ozone-assessed-rom-translation.trycloudflare.com

# Terminal 3 (opcional): Verificar headers preflight
curl -X OPTIONS \
  -H "Origin: https://auxplus.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://ozone-assessed-rom-translation.trycloudflare.com/recargas/credits -v

# Deve conter:
# < HTTP/1.1 200 OK
# < Access-Control-Allow-Origin: *
# < Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
# < Access-Control-Allow-Headers: authorization, content-type, ...
# < Vary: Origin
# < Access-Control-Max-Age: 86400
```

### No Browser (AuxPlus em https://auxplus.vercel.app)
1. Va em **Admin → Automações**
2. Configure **Proxy API**: `https://ozone-assessed-rom-translation.trycloudflare.com`
3. Clique em **Testar Proxy API**
4. Deve aparecer ✅ verde (antes aparecia CORS error)
5. Requisições para `/recargas/credits`, `/dash-reseller`, `/users-iptv` agora funcionam

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `scripts/ges-proxy-server.mjs` | Extrair CORS para função `applyCorsHeaders()` + aplicar em erros |
| `.cloudflared/config.yml` | (Opcional) Configurar tunnel se quiser usar config file em vez de CLI |

## Próximos Passos

1. ✅ Atualizar `ges-proxy-server.mjs`
2. ✅ Deploy / push
3. No PC com o proxy:
   ```bash
   git pull
   node scripts/ges-proxy-server.mjs
   cloudflared tunnel --url http://127.0.0.1:8787
   ```
4. Copiar URL do tunnel (ex: `https://ozone-assessed-rom-translation.trycloudflare.com`)
5. Em **Admin → Automações → Proxy API**: colar a URL
6. Clicar em **Salvar** e **Testar Proxy API**
7. ✅ CORS agora funciona!

## Debug

Se ainda falhar após o fix:

1. **Verificar headers**: `curl -v https://...trycloudflare.com/recargas/credits`
   - Procure por `Access-Control-Allow-Origin`
   - Se faltar → proxy não foi reiniciado

2. **Verifique o tunnel**:
   ```bash
   # Matar tunnel antiga
   cloudflared tunnel list
   cloudflared tunnel delete <old-id>
   # Iniciar nova
   cloudflared tunnel --url http://127.0.0.1:8787
   ```

3. **Logs do proxy**:
   ```bash
   node scripts/ges-proxy-server.mjs 2>&1 | grep -i "cors\|error"
   ```

4. **Testar com curl (sem browser)**:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "x-iptv-path: /login" \
     -d '{"username":"test","password":"test"}' \
     https://seu-tunnel.trycloudflare.com/
   ```
   - Deve devolver resposta (mesmo que 401 auth)
   - Se der "502 Bad Gateway" → proxy não respondeu

5. **Verificar firewall/rede**:
   - O Cloudflare tunnel abre porta 7844 (saída)
   - Algumas redes corporativas bloqueiam
   - Testar em rede diferente (dados móvel, outro PC)
