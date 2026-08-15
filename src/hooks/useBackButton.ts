import { useEffect, useRef } from "react";

/**
 * Hook que intercepta o botão voltar do celular
 * Monitora mudanças no histórico e executa callback quando modal está aberto
 * Se não houver modal, permite navegação normal
 */
export function useBackButton(shouldIntercept: () => boolean, callback: () => void) {
  const historyLengthRef = useRef(window.history.length);

  useEffect(() => {
    const handlePopState = () => {
      if (shouldIntercept()) {
        // Modal está aberto - fecha sem navegar
        callback();
        // Re-adiciona a entrada no histórico
        window.history.pushState(null, "", window.location.href);
      }
      // Se não há modal, deixa a navegação acontecer normalmente
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [shouldIntercept, callback]);

  // Adiciona entrada ao histórico quando modal abre
  useEffect(() => {
    if (shouldIntercept()) {
      window.history.pushState(null, "", window.location.href);
      historyLengthRef.current = window.history.length;
    }
  }, [shouldIntercept]);
}


