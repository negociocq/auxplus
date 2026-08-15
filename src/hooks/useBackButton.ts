import { useEffect } from "react";

/**
 * Hook que intercepta o botão voltar do celular
 * Quando pressionado, executa a callback fornecida
 * Útil para fechar modals/dialogs no mobile
 */
export function useBackButton(callback: () => void) {
  useEffect(() => {
    const handleBackButton = (event: PopStateEvent) => {
      event.preventDefault();
      callback();
      // Mantém a entrada no histórico
      window.history.pushState(null, "", window.location.href);
    };

    // Adiciona uma entrada ao histórico quando o componente monta
    window.history.pushState(null, "", window.location.href);

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [callback]);
}
