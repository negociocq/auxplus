import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

const KEY = "auxplus-hide-balance";
const EVENT = "auxplus:hide-balance";

function readHidden() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Oculta valores monetários em toda a app (privacidade). */
export function useHideBalance() {
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    const sync = () => setHidden(readHidden());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !readHidden();
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setHidden(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const money = useCallback(
    (value: number) => (hidden ? "R$\u00A0••••••" : formatMoney(value)),
    [hidden],
  );

  return { hidden, toggle, money };
}
