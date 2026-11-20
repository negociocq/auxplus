import { useEffect, useRef } from "react";

/**
 * Hook que ajusta o modal quando o teclado abre no mobile.
 * Redimensiona o modal para ocupar apenas o espaço acima do teclado.
 */
export function useKeyboardAdjustment(ref: React.RefObject<HTMLElement>) {
  const resizeTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    const originalMaxHeight = element.style.maxHeight;

    const adjustModal = () => {
      if (!ref.current || !window.visualViewport) return;

      // Obtém as dimensões do viewport
      const viewportHeight = window.visualViewport.height;
      const viewportWidth = window.visualViewport.width;

      // Calcula max-height para deixar espaço pro teclado
      // Usa 85% da altura disponível do viewport
      const maxHeight = Math.max(viewportHeight * 0.85, 250);

      // Aplica a nova altura máxima
      element.style.maxHeight = `${maxHeight}px`;
      element.style.height = "auto";

      // Encontra e faz scroll para o input focado
      const input = element.querySelector("input:focus, textarea:focus") as HTMLElement | null;
      if (input) {
        setTimeout(() => {
          input.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 200);
      }
    };

    // Função para debounce
    const handleResize = () => {
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(adjustModal, 50);
    };

    // Event listeners
    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", adjustModal);

    // Também ajusta quando um input recebe foco
    const inputs = element.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      input.addEventListener("focus", () => {
        setTimeout(adjustModal, 100);
      });
    });

    // Ajusta na primeira renderização
    adjustModal();

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", adjustModal);
      clearTimeout(resizeTimeoutRef.current);
      element.style.maxHeight = originalMaxHeight;
    };
  }, [ref]);
}



