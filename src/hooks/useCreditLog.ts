import { useEffect } from "react";
import type { User } from "@/types";
import { onUniplayCreditsChanged } from "@/lib/uniplayCreditsSync";
import { showLocalAlert } from "@/lib/localNotifications";
import {
  creditLogLabelForSource,
  creditLogTypeForSource,
  fetchPanelCreditsForUser,
  fmtCreditValue,
  getLastCreditBalance,
  patchCreditLogEntry,
  pushCreditLog,
  setLastCreditBalance,
  type CreditLogEntry,
} from "@/lib/creditLog";

/**
 * Registra no log de créditos toda ação que altera o saldo UniPlay
 * (renovação, ativação de teste, recarga de revendedor), mostrando o saldo
 * antigo → novo, e dispara notificação (sino + mobile) junto com as demais.
 */
export function useCreditLog(user: User | null) {
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const off = onUniplayCreditsChanged((detail) => {
      const spent = Math.max(0, Math.abs(Number(detail.spent) || 0));
      const oldBalance = getLastCreditBalance(userId);
      const newBalance = oldBalance != null ? oldBalance - spent : null;
      const entry: CreditLogEntry = {
        id: `cl_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        at: Date.now(),
        type: creditLogTypeForSource(detail.source),
        label: detail.label || creditLogLabelForSource(detail.source),
        detail: detail.detail,
        delta: -spent,
        oldBalance,
        newBalance,
      };
      pushCreditLog(userId, entry);

      // Corrige o saldo novo com o valor real do painel
      void fetchPanelCreditsForUser(userId).then((real) => {
        if (real != null) {
          setLastCreditBalance(userId, real);
          patchCreditLogEntry(userId, entry.id, { newBalance: real });
        }
      });

      const body = detail.detail
        ? `${detail.detail} · saldo ${fmtCreditValue(oldBalance)} → ${fmtCreditValue(newBalance)}`
        : `Saldo: ${fmtCreditValue(oldBalance)} → ${fmtCreditValue(newBalance)}`;
      void showLocalAlert(
        {
          title: entry.label,
          body,
          tag: `credit-${entry.id}`,
          url: "/automations",
        },
        { userId },
      );
    });

    return off;
  }, [userId]);
}