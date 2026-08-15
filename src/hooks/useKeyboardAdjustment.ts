import { useEffect, useRef } from "react";

/**
 * Hook que ajusta o modal para não ficar coberto pelo teclado no mobile.
 * Usa visualViewport para detectar a mudança de altura quando o teclado abre.
 */
export function useKeyboardAdjustment(ref: React.RefObject<HTMLElement>) {
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    let lastViewportHeight = window.visualViewport?.height ?? window.innerHeight;

    const handleViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDiff = lastViewportHeight - currentHeight;

      // Se a altura diminuiu significativamente, o teclado abriu
      if (heightDiff > 100) {
        // Aguarda um pouco para o teclado estar totalmente aberto
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          // Calcula o espaço disponível após o teclado
          const keyboardHeight = heightDiff;
          const viewportTop = window.visualViewport?.offsetTop ?? 0;

          // Foca no input dentro do modal para scroll automático
          const input = element.querySelector("input:focus, textarea:focus");
          if (input) {
            input.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }

          // Ajusta padding inferior para dar espaço do teclado
          const scrollableArea = element.closest(
            '[class*="overflow-y-auto"], [class*="max-h"]'
          ) as HTMLElement | null;

          if (scrollableArea) {
            scrollableArea.style.paddingBottom = `${Math.max(
              keyboardHeight + 20,
              40
            )}px`;
          }
        }, 100);
      } else if (heightDiff < -50) {
        // O teclado fechou
        const scrollableArea = element.closest(
          '[class*="overflow-y-auto"], [class*="max-h"]'
        ) as HTMLElement | null;

        if (scrollableArea) {
          scrollableArea.style.paddingBottom = "";
        }
      }

      lastViewportHeight = currentHeight;
    };

    // Event listeners para detectar mudanças no viewport
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener(
      "scroll",
      handleViewportChange
    );

    // Fallback: também escuta orientationchange
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener(
        "scroll",
        handleViewportChange
      );
      window.removeEventListener("orientationchange", handleViewportChange);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, [ref]);
}
