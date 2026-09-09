import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { verifySecret } from "@/lib/password";
import { rateLimitHit, rateLimitClear, rateLimitStatus } from "@/lib/rate-limit";

export class PinError extends Error {}
export class PinNotSetError extends PinError {
  constructor() {
    super("No signing PIN set");
  }
}
export class PinWrongError extends PinError {
  constructor() {
    super("That PIN is not right");
  }
}
export class PinLockedError extends PinError {
  constructor(public retryAfterSec: number) {
    super("Too many PIN attempts");
  }
}

// A signing PIN is only 4–6 digits, so it must be rate limited hard: a handful
// of tries, then a long lockout keyed to the staff member.
const PIN_LIMIT = { limit: 5, windowSec: 15 * 60, lockoutSec: 30 * 60 };

/**
 * Confirm an action is really being taken by `staffId` on a shared computer.
 * Throws PinNotSetError / PinWrongError / PinLockedError so callers can surface
 * a helpful message — see `pinCheck` for the mapped-to-string version.
 */
export async function verifyPin(staffId: string, pin: string): Promise<void> {
  const key = `pin:${staffId}`;

  const status = await rateLimitStatus(key);
  if (!status.ok) throw new PinLockedError(status.retryAfterSec);

  const pinValue = (pin ?? "").trim();
  if (!/^\d{4,6}$/.test(pinValue)) {
    await failure(key);
    throw new PinWrongError();
  }

  const person = await getDb().query.staff.findFirst({
    where: eq(staff.id, staffId),
    columns: { pinHash: true },
  });
  if (!person?.pinHash) throw new PinNotSetError();

  const ok = await verifySecret(person.pinHash, pinValue);
  if (!ok) {
    await failure(key);
    throw new PinWrongError();
  }

  await rateLimitClear(key);
}

async function failure(key: string): Promise<void> {
  const hit = await rateLimitHit(key, PIN_LIMIT);
  if (!hit.ok) throw new PinLockedError(hit.retryAfterSec);
}

/**
 * `verifyPin` wrapped for `useActionState` flows: returns `null` on success or a
 * ready-to-show error string.
 */
export async function pinCheck(staffId: string, pin: string): Promise<string | null> {
  try {
    await verifyPin(staffId, pin);
    return null;
  } catch (err) {
    if (err instanceof PinNotSetError) {
      return "Set a signing PIN first (in your account) to sign this off.";
    }
    if (err instanceof PinLockedError) {
      const mins = Math.ceil(err.retryAfterSec / 60);
      return `Too many wrong PINs — try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
    }
    return "That PIN is not right.";
  }
}
