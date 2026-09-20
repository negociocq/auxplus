import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync, existsSync } from "fs";

// Load environment variables for Evolution API configuration
function loadEnvConfig() {
  const envPath = ".env.local";
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    const env: Record<string, string> = {};
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        env[key] = value;
      }
    }
    return env;
  }
  return {};
}

const env = loadEnvConfig();

export default defineConfig(() => ({
  server: {
    host: "::",
    // Alinhado ao Site URL padrão do Supabase (links de e-mail/OTP)
    port: 3000,
    proxy: {
      // Evolution API proxy - supports both local (localhost:8080) and remote URLs
      // When Evolution API is remote, the app uses the remote URL directly
      // When Evolution API is local, this proxy avoids CORS issues
      "/evolution-api": {
        target: env.VITE_EVOLUTION_API_URL || "http://127.0.0.1:8080",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/evolution-api/, ""),
        configure: (proxy) => {
          // Add ngrok skip warning header for local Evolution API
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("ngrok-skip-browser-warning", "true");
          });
        },
      },
      // API do painel IPTV (gesapioffice).
      // A API rejeita login sem Origin do front do painel ("Credencias não encontradas").
      "/ges-api": {
        target: "https://gesapioffice.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/ges-api/, "/api"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Origin", "https://searchdefense.top");
            proxyReq.setHeader("Referer", "https://searchdefense.top/");
          });
        },
      },
    },
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Polyfill Node.js 'crypto' module for bcryptjs in browser environments.
      // Vite externalizes 'crypto' for browser compatibility, but bcryptjs
      // tries to import it and fails with "Cannot access crypto.randomBytes".
      // This maps it to a browser-compatible polyfill using Web Crypto API.
      crypto: path.resolve(__dirname, "./src/lib/crypto-polyfill.ts"),
    },
  },
}));
