import type { WaBotStateStore } from "@/lib/whatsappBotConfig";

/** Mesmas duas fontes de pausa usadas pelo webhook, unificando variações do telefone. */
export function humanConversationPhones(state: WaBotStateStore, normalize: (phone: string) => string | null): string[] {
  const phones = new Set<string>();
  for (const [phone, paused] of Object.entries(state.humanPaused || {})) {
    if (paused) phones.add(normalize(phone) || phone);
  }
  for (const [phone, session] of Object.entries(state.sessions || {})) {
    if (session.state === "human") phones.add(normalize(phone) || phone);
  }
  return [...phones].sort();
}
