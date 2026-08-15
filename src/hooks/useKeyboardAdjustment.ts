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
          // Foca no input dentro do modal para scroll automático
          const input = element.querySelector("input:focus, textarea:focus") as HTMLElement | null;
          if (input) {
            input.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }

          // Ajusta padding inferior no modal para dar espaço do teclado
          const keyboardHeight = heightDiff;
          element.style.paddingBottom = `${Math.max(
            keyboardHeight + 20,
            40
          )}px`;
        }, 100);
      } else if (heightDiff < -50) {
        // O teclado fechou - remove o padding
        element.style.paddingBottom = "";
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
      element.style.paddingBottom = "";
    };
  }, [ref]);
}

