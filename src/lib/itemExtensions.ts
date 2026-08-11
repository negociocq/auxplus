/**
 * Extensões para itens (Clientes UniPlay) com suporte a marcas de ciclo (prorrogações).
 */

import type { Item } from "./storage";

export type ProrrogaKind = "48h" | "23:59";

export interface ProrrogaUsage {
  usedAt: string; // ISO date
  kind: ProrrogaKind;
  oldDue: string; // yyyy-MM-dd
  newDue: string; // yyyy-MM-dd
}

export const PRORROGA_MARKER_PREFIX = "<!--AXEXT:";
export const PRORROGA_MARKER_SUFFIX = "-->";

/**
 * Extrai o uso de prorrogação das notes do item, se existir.
 */
export function extractProrrogaUsage(item: Item): ProrrogaUsage | null {
  if (!item.notes) return null;

  const start = item.notes.indexOf(PRORROGA_MARKER_PREFIX);
  if (start === -1) return null;

  const end = item.notes.indexOf(PRORROGA_MARKER_SUFFIX, start);
  if (end === -1) return null;

  const jsonStr = item.notes.slice(start + PRORROGA_MARKER_PREFIX.length, end);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Verifica se o item já usou prorrogação no ciclo atual.
 * Um ciclo é considerado "pago" se a data do último pagamento é posterior ao uso da prorrogação.
 */
export function hasUsedProrrogaInCurrentCycle(item: Item): boolean {
  const usage = extractProrrogaUsage(item);
  if (!usage) return false;

  // Se não há pagamentos, não há ciclo pago
  if (!item.payments || item.payments.length === 0) return true;

  // Pega o último pagamento (mais recente)
  const lastPayment = item.payments[item.payments.length - 1];
  const paymentDate = lastPayment.date;
  const usageDate = usage.usedAt;

  // Se o pagamento é posterior ao uso, o ciclo foi renovado
  return paymentDate <= usageDate;
}

/**
 * Cria um marcador de prorrogação para adicionar às notes.
 */
export function createProrrogaMarker(usage: ProrrogaUsage): string {
  return `${PRORROGA_MARKER_PREFIX}${JSON.stringify(usage)}${PRORROGA_MARKER_SUFFIX}`;
}

/**
 * Adiciona/atualiza marcador de prorrogação nas notes do item.
 */
export function withProrrogaUsage(item: Item, usage: ProrrogaUsage): Item {
  const marker = createProrrogaMarker(usage);

  // Remove qualquer marcador existente
  let notes = item.notes || "";
  const existingMarker = extractProrrogaUsage(item);
  if (existingMarker) {
    const existingFullMarker = createProrrogaMarker(existingMarker);
    notes = notes.replace(existingFullMarker, "").trim();
  }

  // Adiciona novo marcador no início
  const newNotes = marker + (notes ? "\n" + notes : "");
  return { ...item, notes: newNotes };
}

/**
 * Remove o marcador de prorrogação das notes do item (para reset de ciclo).
 */
export function withoutProrrogaUsage(item: Item): Item {
  const usage = extractProrrogaUsage(item);
  if (!usage) return item;

  const marker = createProrrogaMarker(usage);
  let notes = item.notes || "";
  notes = notes.replace(marker, "").trim();

  return { ...item, notes: notes || null };
}

/**
 * Calcula nova data de vencimento baseado no tipo de prorrogação.
 */
export function calculateNewDueDate(oldDue: string, kind: ProrrogaKind): string {
  const date = new Date(oldDue + "T23:59:59");

  if (kind === "48h") {
    date.setDate(date.getDate() + 2);
  } else if (kind === "23:59") {
    // Mantém o mesmo dia, apenas garante vencimento às 23:59
    // Já está configurado na criação da data
  }

  return date.toISOString().split("T")[0];
}
