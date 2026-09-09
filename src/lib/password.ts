import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters.
const OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashSecret(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export function verifySecret(digest: string, plain: string): Promise<boolean> {
  return verify(digest, plain, OPTS);
}

const AMBIGUOUS = /[0OIl1]/g;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** A readable temporary password handed to a new staff member. */
export function generateTempPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out.replace(AMBIGUOUS, "x");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
