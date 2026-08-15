import { useEffect, useRef } from "react";

/**
 * Hook que faz o modal subir quando o teclado abre no mobile.
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
      if (heightDiff > 80) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          // Calcula quanto o modal deve subir
          const moveUp = Math.min(heightDiff + 40, 300);
          element.style.bottom = `${moveUp}px`;

          // Faz scroll para o input focado
          const input = element.querySelector("input:focus, textarea:focus") as HTMLElement | null;
          if (input) {
            input.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }
        }, 100);
      } else if (heightDiff < -50) {
        // O teclado fechou - volta à posição original
        element.style.bottom = "0";
      }

      lastViewportHeight = currentHeight;
    };

    // Event listeners para detectar mudanças no viewport
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    // Fallback: também escuta orientationchange
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      clearTimeout(scrollTimeoutRef.current);
      element.style.bottom = "0";
    };
  }, [ref]);
}



