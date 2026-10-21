/** Logins antigos confirmados para o mesmo cadastro, preservados nas notas. */
export function historicalIptvUsernames(notes?: string | null): string[] {
  const marker = String(notes || "").match(/<!--AXUSERALIASES:([\s\S]*?)-->/);
  if (!marker) return [];
  try {
    const value: unknown = JSON.parse(marker[1]);
    return Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && /^[A-Za-z0-9._-]+$/.test(entry)).map((entry) => entry.toLowerCase()))] : [];
  } catch {
    return [];
  }
}

export function stripHistoricalIptvUsernames(notes?: string | null): string {
  return String(notes || "").replace(/\n?<!--AXUSERALIASES:[\s\S]*?-->/g, "").trim();
}

export function preserveHistoricalIptvUsernames(next?: string | null, previous?: string | null, previousUsername?: string): string {
  const oldUsername = previousUsername?.trim().toLowerCase();
  const aliases = [...new Set([...historicalIptvUsernames(previous), ...historicalIptvUsernames(next), ...(oldUsername && /^[A-Za-z0-9._-]+$/.test(oldUsername) ? [oldUsername] : [])])];
  const clean = stripHistoricalIptvUsernames(next);
  return aliases.length ? `${clean}${clean ? "\n" : ""}<!--AXUSERALIASES:${JSON.stringify(aliases)}-->` : clean;
}
