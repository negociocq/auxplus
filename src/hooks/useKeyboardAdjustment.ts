import { useEffect, useRef } from "react";

/**
 * Hook que ajusta o modal para não ficar coberto pelo teclado no mobile.
 * Usa visualViewport para detectar a mudança de altura quando o teclado abre.
 */
export function useKeyboardAdjustment(ref: React.RefObject<HTMLElement>) {
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const focusHandlerRef = useRef<((e: FocusEvent) => void) | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    let lastViewportHeight = window.visualViewport?.height ?? window.innerHeight;

    // Handler para quando input recebe foco
    const handleInputFocus = (e: FocusEvent) => {
      const input = e.target as HTMLElement;

      // Aguarda um pouco para o teclado estar totalmente aberto
      setTimeout(() => {
        input.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 300);
    };

    const handleViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDiff = lastViewportHeight - currentHeight;

      // Se a altura diminuiu significativamente, o teclado abriu
      if (heightDiff > 80) {
        // Aguarda um pouco para o teclado estar totalmente aberto
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          // Encontra o input focado e faz scroll para ele
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
            60
          )}px`;
        }, 150);
      } else if (heightDiff < -50) {
        // O teclado fechou - remove o padding
        element.style.paddingBottom = "";
      }

      lastViewportHeight = currentHeight;
    };

    // Adiciona listener para quando input recebe foco
    focusHandlerRef.current = handleInputFocus;
    const inputs = element.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      input.addEventListener("focus", focusHandlerRef.current!);
    });

    // Event listeners para detectar mudanças no viewport
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    // Fallback: também escuta orientationchange
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      // Remove event listeners
      if (focusHandlerRef.current) {
        inputs.forEach((input) => {
          input.removeEventListener("focus", focusHandlerRef.current!);
        });
      }
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      clearTimeout(scrollTimeoutRef.current);
      element.style.paddingBottom = "";
    };
  }, [ref]);
}


