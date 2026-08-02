import type { Item } from "@/types";

const MARKER_RE = /\n?<!--AXSCREENS:(\d+)-->/g;

export function stripScreensMarker(notes?: string | null): string {
  return String(notes ?? "")
    .replace(MARKER_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractScreens(notes?: string | null): number | null {
  const m = /<!--AXSCREENS:(\d+)-->/.exec(String(notes ?? ""));
  if (!m) return null;
  const n = Math.floor(Number(m[1]));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(10, n);
}

export function embedScreensInNotes(
  notes: string | null | undefined,
  screens: number | null | undefined,
): string {
  const clean = stripScreensMarker(notes);
  const n = screens != null ? Math.floor(Number(screens)) : 0;
  if (!Number.isFinite(n) || n < 1) return clean;
  const marker = `<!--AXSCREENS:${Math.min(10, n)}-->`;
  return clean ? `${clean}\n${marker}` : marker;
}

export function getItemScreens(
  item: Pick<Item, "screens" | "notes">,
  fallback = 1,
): number {
  if (item.screens != null && Number.isFinite(Number(item.screens))) {
    return Math.max(1, Math.min(10, Math.floor(Number(item.screens))));
  }
  return extractScreens(item.notes) ?? fallback;
}

export function clampScreens(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(10, n);
}
