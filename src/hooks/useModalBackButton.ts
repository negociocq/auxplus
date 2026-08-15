import { useEffect, useCallback } from "react";

/**
 * Hook que monitora o botão voltar do celular
 * Quando um modal está aberto e o usuário clica voltar, fecha o modal
 * Se não houver modal, permite navegação normal
 */
export function useModalBackButton(
  isModalOpen: boolean,
  onClose: () => void
) {
  const handlePopState = useCallback(() => {
    if (isModalOpen) {
      // Modal está aberto - fecha ele e volta o histórico
      onClose();
      window.history.pushState(null, "", window.location.href);
    }
    // Se não há modal, deixa navegar normalmente
  }, [isModalOpen, onClose]);

  useEffect(() => {
    if (!isModalOpen) return;

    // Quando modal abre, adiciona entrada ao histórico
    window.history.pushState({ modal: true }, "", window.location.href);

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isModalOpen, handlePopState]);
}
