import { useEffect, useRef } from "react";

/**
 * No mobile, o botão Voltar fecha o modal em vez de sair da página.
 * Empilha um estado no history enquanto o dialog estiver aberto.
 */
export function useDialogHistoryBack(
  open: boolean,
  onClose: () => void,
  key = "dialog",
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (open) {
      if (!pushedRef.current) {
        window.history.pushState({ auxplusDialog: key }, "");
        pushedRef.current = true;
      }
      const onPop = () => {
        if (ignoreNextPopRef.current) {
          ignoreNextPopRef.current = false;
          return;
        }
        if (!pushedRef.current) return;
        pushedRef.current = false;
        onCloseRef.current();
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
      };
    }

    // Fechou pelo X / overlay: remove a entrada empilhada sem reabrir lógica
    if (pushedRef.current) {
      pushedRef.current = false;
      if (window.history.state?.auxplusDialog === key) {
        ignoreNextPopRef.current = true;
        window.history.back();
      }
    }
    return undefined;
  }, [open, key]);
}
