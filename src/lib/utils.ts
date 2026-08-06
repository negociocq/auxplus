import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza texto para busca: minúsculas, sem acentos/acentos tipográficos.
 * "Sávio" → "savio", "João" → "joao". Use nos dois lados da comparação.
 */
export function normSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

