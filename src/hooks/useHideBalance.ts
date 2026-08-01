import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

const KEY = "auxplus-hide-balance";
const EVENT = "auxplus:hide-balance";
const MASK_NUM = "••";
const MASK_TEXT = "••••";

function readHidden() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Oculta saldos, contagens, eixos de gráfico e telefones (privacidade). */
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

  useEffect(() => {
    document.documentElement.dataset.hideBalance = hidden ? "1" : "0";
  }, [hidden]);

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

  /** Contagens / eixos numéricos */
  const num = useCallback(
    (value: number | string | null | undefined) =>
      hidden ? MASK_NUM : String(value ?? 0),
    [hidden],
  );

  /** Textos compostos com números (hints, badges) */
  const text = useCallback(
    (visible: string) => (hidden ? MASK_TEXT : visible),
    [hidden],
  );

  /** Máscara telefone na UI (privacidade); não altera o valor salvo. */
  const phone = useCallback(
    (value?: string | null) => {
      const v = String(value || "").trim();
      if (!v) return "—";
      return hidden ? "•••••••••••" : v;
    },
    [hidden],
  );

  /** Máscara login/usuário na UI (conta UniPlay, IPTV, etc.). */
  const user = useCallback(
    (value?: string | null) => {
      const v = String(value || "").trim();
      if (!v) return "—";
      return hidden ? "••••••••" : v;
    },
    [hidden],
  );

  return { hidden, toggle, money, num, text, phone, user };
}
