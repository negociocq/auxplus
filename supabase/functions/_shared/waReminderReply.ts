export const RENEWAL_REPLY_CTA = "Digite *1* para renovar e receber o PIX.";

export function upgradeReminderReplyText(text: string): string {
  return text.replace(/\*?Responda esta mensagem\*?\s+para\s+(?:receber as opções de renovação automática|renovar automaticamente)\.?/gi, RENEWAL_REPLY_CTA);
}

/** Numeric menu choices inside an active support/trial flow keep their original meaning. */
export function isReminderRenewalReply(text: string, state?: string): boolean {
  return text.trim() === "1" && ["idle", "ask_intent"].includes(state || "idle");
}

/** Only an explicit username in a quoted reminder can disambiguate multiple owned accesses. */
export function quotedReminderUsername(data: Record<string, unknown>): string {
  const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
  const message = object(data.message);
  const contexts = [object(data.contextInfo), object(object(message.extendedTextMessage).contextInfo), object(object(message.imageMessage).contextInfo)];
  for (const context of contexts) {
    const quote = object(context.quotedMessage);
    const text = String(quote.conversation || object(quote.extendedTextMessage).text || object(quote.imageMessage).caption || "").replace(/[*`~]/g, "");
    const username = text.match(/(?:^|\n)[^\S\r\n]*(?:👤\s*)?_?Usu[aá]rio:_?\s*([^\s\n]+)/i)?.[1];
    if (username) return username.trim().toLowerCase();
  }
  return "";
}
