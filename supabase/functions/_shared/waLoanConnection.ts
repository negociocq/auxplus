/** Separate, stable namespace per account/folder; changing a username never changes its connection. */
export function loanInstanceName(prefix: string, userId: string, folderId: string): string {
  const base = String(prefix || "auxplus").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "auxplus";
  let hash = 14695981039346656037n;
  for (const char of JSON.stringify([String(userId), String(folderId)])) {
    hash ^= BigInt(char.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `${base}-loan-${hash.toString(16).padStart(16, "0")}`;
}
export function isLoanWhatsappInstance(instance: string): boolean {
  return /-loan-[a-f0-9]{16}$/i.test(instance);
}
