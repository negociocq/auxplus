# Fix Browser Console Errors (bcryptjs + ges-api 500)

## Context

The application console shows three related problems:

1. **bcryptjs crypto error**: `Module "crypto" has been externalized for browser compatibility. Cannot access "crypto.randomBytes" in client code.` — Vite externalizes the Node.js `crypto` module for browser compatibility, but `bcryptjs` tries to import it. This breaks `hashPassword()` and `verifyPassword()` in the browser.

2. **ges-api 500 error**: `ges-api/users-iptv:1 Failed to load resource: the server responded with a status of 500 (Internal Server Error)` — The app proxies requests to `https://gesapioffice.com/api` (external IPTV panel) via Vite proxy `/ges-api` or Supabase Edge Function `ges-api`. The upstream server returns 500.

3. **"Painel temporariamente indisponível (500), não consigo gerar teste"** — This is the user-facing error message from `src/pages/UniPlay.tsx:749` when test generation fails. It's caused by the ges-api 500 error.

## Root Cause Analysis

### Issue 1: bcryptjs crypto

`src/lib/password.ts` imports `bcryptjs` which uses Node.js `crypto` module internally. In Vite, this module is externalized for browser compatibility, causing a runtime error. The fix is to polyfill the `crypto` module with the browser's Web Crypto API.

### Issue 2 & 3: ges-api 500

The ges-api 500 error originates from the external IPTV panel server (`gesapioffice.com`). This is an upstream server issue, not a client-side bug. However, the client-side error handling can be improved to:
- Show a clearer, more actionable error message
- Distinguish between network errors and upstream 500 errors
- Potentially retry or fall back to alternative endpoints

## Implementation Plan

### 1. Fix bcryptjs crypto error

**File**: `src/lib/password.ts`

Add a crypto polyfill before importing bcryptjs. The browser's Web Crypto API provides `crypto.getRandomValues()` which bcryptjs can use as a fallback.

```typescript
// Polyfill crypto for bcryptjs in browser environments
// bcryptjs tries to import Node.js 'crypto' module which Vite externalizes
if (typeof window !== "undefined" && typeof crypto !== "undefined") {
  // Ensure crypto.randomBytes is available (bcryptjs fallback)
  if (!(crypto as any).randomBytes) {
    (crypto as any).randomBytes = (length: number) => {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    };
  }
}

import bcrypt from "bcryptjs";
// ... rest of file unchanged
```

Alternatively, configure Vite to polyfill crypto:

**File**: `vite.config.ts`

Add `resolve.alias` to map `crypto` to a browser-compatible polyfill, or use `define` to stub it out.

### 2. Improve ges-api error handling

**File**: `src/lib/iptvPanelApi.ts`

Enhance the `panelFetch` function to:
- Catch and parse upstream 500 errors
- Return a more descriptive error message indicating the panel is temporarily unavailable
- Include the upstream status in the error

**File**: `src/pages/UniPlay.tsx`

Update the error handler at line 743-749 to:
- Show a clearer message: "Painel temporariamente indisponível (500). Tente novamente em instantes."
- Optionally add a retry button for test generation

## Validation

1. Run `npm run dev` and verify no bcryptjs crypto errors in console
2. Test password hashing/verification (login, register, change password) works
3. Test test generation flow - verify error message is clear when panel is down
4. Run `npm run lint` and `npm run typecheck` to ensure no TypeScript/lint errors