import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { initPwaInstallCapture } from "./lib/pwaInstall";

// Precisa rodar antes do React: o Chrome dispara beforeinstallprompt cedo.
initPwaInstallCapture();

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* ignore */
  });
}

createRoot(document.getElementById("root")!).render(<App />);
