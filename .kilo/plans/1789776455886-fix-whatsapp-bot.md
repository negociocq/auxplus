# Fix WhatsApp Bot Not Responding

## Problem
- Console shows: `POST /ges-api/users-iptv 500` (panel error) and `POST/PUT /evolution-api/webhook/set/auxplus-tarciocq1 400/404` (webhook registration failing)
- Bot does not respond to WhatsApp messages
- Evolution API: Remote/Cloud (user answer)
- Panel access, proxy setup, and app status: Unknown

## Root Cause Analysis

### 1. 500 Error on `/ges-api/users-iptv`
- **Location**: `src/lib/iptvPanelApi.ts:662-751` (`panelFetch` function)
- **Cause**: The panel API at `gesapioffice.com` returns 500 when:
  - The Bearer token is invalid/expired and there are no saved credentials to renew
  - The panel itself is down or returning internal errors
  - The proxy chain (Vercel/Supabase Edge) is blocked by UniPlay IP filtering
- **The `panelFetch` function already handles 5xx errors silently** (line 724-731), but the error still propagates to the UI

### 2. Webhook Registration 400/404
- **Location**: `src/lib/whatsappAutomation.ts:1055-1132` (`setEvolutionWebhook`)
- **Cause**: The Evolution instance `auxplus-tarciocq1` doesn't exist (404) or the request body format is wrong (400)
- **The `ensureEvolutionInstance` function** (line 839-888) tries to the create the instance, but if the API URL/key is wrong, it fails silently

### 3. Evolution API Configuration
- **Location**: `src/lib/whatsappAutomation.ts:750-771` (`resolveEvolutionBaseUrl`)
- **Issue**: In dev mode, it uses `/evolution-api` proxy pointing to `http://127.0.0.1:8080`
- **If Evolution is remote**, the user needs to configure `VITE_EVOLUTION_API_URL` in `.env.local`
- **If Evolution is local but not running on port 8080**, the proxy target is wrong

## Affected Files
- `src/lib/iptvPanelApi.ts` - Panel API integration (panelFetch, loginIptvPanel, resolveBase)
- `src/lib/whatsappAutomation.ts` - Evolution instance creation and webhook registration
- `vite.config.ts` - Proxy configuration for Evolution API and GES API
- `src/lib/platformApi.ts` - Evolution platform config loading
- `supabase/functions/evolution-webhook/index.ts` - Webhook handler for bot messages
- `supabase/functions/ges-api/index.ts` - Proxy for UniPlay panel API
- `api/gesapi.js` - Vercel Node.js proxy
- `scripts/ges-proxy-server.mjs` - Local GES proxy server

## Changes Already Made
- `ensureEvolutionInstance()`: Now tries multiple creation endpoints (`/instance/create`, `/instance`, `/instances/create`) and body formats
- `setEvolutionWebhook()`: Now tries nested format (`webhook: {...}`) first, then flat formats, with both POST and PUT methods
- `vite.config.ts`: Updated to support both local and remote Evolution API via environment variable
- `.env.example`: Added documentation for Evolution API configuration options

## Implementation Plan

### Step 1: Verify Evolution API Configuration
1. Open the app in browser (http://localhost:3000)
2. Go to Admin → API
3. Check the Evolution API URL and API Key
4. Verify the instance name is `auxplus-tarciocq1`
5. If Evolution is remote, update the config to use the remote URL

### Step 2: Fix Evolution API Proxy (if needed)
If Evolution API is remote:
- Update `vite.config.ts` to NOT proxy `/evolution-api` to localhost
- Instead, configure the app to use the remote Evolution API URL directly

If Evolution API is local:
- Ensure Evolution API is running on port 8080
- Check Docker containers or Node.js processes

### Step 3: Verify Panel Connectivity
1. Test panel access: `curl -I https://searchdefense.top`
2. Test API access: `curl -I https://gesapioffice.com/api`
3. If panel is accessible, verify credentials in Admin → Automações

### Step 4: Check GES Proxy
1. Check if proxy server is running: `npm run ges-proxy`
2. Check port 8787
3. Check if tunnel is active (cloudflared/ngrok)

### Step 5: Test Webhook Registration
1. Open the app
2. Go to WhatsApp settings
3. Click "Refresh QR" to reconnect
4. Click "Verify webhook" to check webhook status
5. Send a test message from WhatsApp

### Step 6: Check Supabase Webhook Logs
1. Go to Supabase dashboard
2. Functions → evolution-webhook → Logs
3. Look for recent errors

## Success Criteria
- Webhook registers successfully (no 400/404 errors)
- Panel returns 200 instead of 500
- Bot responds to WhatsApp messages within 2 seconds