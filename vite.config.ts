import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    // Alinhado ao Site URL padrão do Supabase (links de e-mail/OTP)
    port: 3000,
    proxy: {
      // Evita CORS: o browser fala com o Vite, que encaminha à Evolution local
      "/evolution-api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/evolution-api/, ""),
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
    },
  },
}));
