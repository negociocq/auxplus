/** Only a private-chat upsert can start the attendant. A contact's Status is not a DM. */
export function skipAttendantEvent(event: string, data: Record<string, unknown>): string | null {
  const normalized = event.trim().toLowerCase().replace(/[_-]/g, ".");
  if (normalized && normalized !== "messages.upsert" && normalized !== "upsert") return "not_message_upsert";
  const key = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
  const jid = String(key.remoteJid || data.remoteJid || "").trim().toLowerCase();
  if (jid === "status@broadcast") return "status";
  if (jid.endsWith("@broadcast")) return "broadcast";
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@newsletter")) return "newsletter";
  if (!/^\d{5,20}(?::\d+)?@(s\.whatsapp\.net|c\.us|lid)$/.test(jid)) return "not_private_chat";
  return null;
}
