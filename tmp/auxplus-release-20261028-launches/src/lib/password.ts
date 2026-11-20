import bcrypt from "bcryptjs";

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

/** PHP ($2y$) e Node ($2a$) são compatíveis para verificação. */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    const normalized = stored.startsWith("$2y$")
      ? `$2a$${stored.slice(4)}`
      : stored;
    return bcrypt.compare(plain, normalized);
  }
  return plain === stored;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
