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
 * Normaliza número de telefone removendo caracteres especiais.
 * Permite comparação entre formatos diferentes (+5571 8373-9054 vs +5571983739054).
 */
export function normalizePhone(phone: string): string {
  return String(phone || "").replace(/\D/g, "").trim();
}

/**
 * Encontra item pelo telefone, priorizando clientes ativos (não vencidos).
 * Se houver múltiplos com o mesmo número, retorna o mais recente/ativo.
 */
export function findItemByNormalizedPhone(
  items: Item[],
  phone: string
): Item | null {
  if (!phone || !phone.trim()) return null;

  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const matches = items.filter(
    (item) =>
      item.isActive !== false && normalizePhone(item.phone || "") === normalized
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Se houver múltiplos, priorizar: ativo > vencido, depois mais recente
  const active = matches.filter(
    (i) => i.status === "Longe de Vencer" || i.status === "Perto de Vencer"
  );
  if (active.length > 0) {
    // Entre os ativos, pega o que vence mais cedo (o mais urgente)
    return active.sort((a, b) => {
      const da = a.dueDate || "9999";
      const db = b.dueDate || "9999";
      return da.localeCompare(db);
    })[0];
  }

  // Se todos vencidos, pega o mais recente
  return matches.sort((a, b) => {
    const da = a.createdAt || "";
    const db = b.createdAt || "";
    return db.localeCompare(da);
  })[0];
}

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
  // Converte a data do formato brasileiro (DD/MM/YYYY) para ISO (YYYY-MM-DD)
  let isoDate: string;

  // Verifica se é formato brasileiro DD/MM/YYYY
  const brazilianMatch = oldDue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilianMatch) {
    const [, day, month, year] = brazilianMatch;
    isoDate = `${year}-${month}-${day}`;
  }
  // Verifica se já é formato ISO YYYY-MM-DD
  else if (oldDue.match(/^\d{4}-\d{2}-\d{2}/)) {
    isoDate = oldDue;
  }
  // Outro formato - tenta parsear
  else {
    isoDate = new Date(oldDue).toISOString().split("T")[0];
  }

  const date = new Date(isoDate + "T23:59:59");

  if (kind === "48h") {
    date.setDate(date.getDate() + 2);
  } else if (kind === "23:59") {
    // Mantém o mesmo dia, apenas garante vencimento às 23:59
    // Já está configurado na criação da data
  }

  // Retorna no formato ISO (YYYY-MM-DD)
  const result = date.toISOString().split("T")[0];

  return result;
}
