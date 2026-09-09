import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { verifySecret } from "@/lib/password";
import { rateLimitHit, rateLimitClear, rateLimitStatus } from "@/lib/rate-limit";

// A wrong current-password guards a sensitive change (password / PIN reset), so
// throttle it the same way we throttle login.
const REAUTH_LIMIT = { limit: 5, windowSec: 15 * 60, lockoutSec: 15 * 60 };

export class ReauthLockedError extends Error {
  constructor(public retryAfterSec: number) {
    super("Too many attempts");
  }
}

/**
 * Confirm `plain` is the signed-in staff member's current password. Returns the
 * staff row on success, `null` on a wrong password. Throws `ReauthLockedError`
 * when the account has hit the re-auth attempt limit.
 */
export async function verifyCurrentPassword(
  staffId: string,
  plain: string,
): Promise<typeof staff.$inferSelect | null> {
  const key = `reauth:${staffId}`;

  const status = await rateLimitStatus(key);
  if (!status.ok) throw new ReauthLockedError(status.retryAfterSec);

  const person = await getDb().query.staff.findFirst({
    where: eq(staff.id, staffId),
  });
  const ok = person ? await verifySecret(person.passwordHash, plain) : false;

  if (!ok) {
    const hit = await rateLimitHit(key, REAUTH_LIMIT);
    if (!hit.ok) throw new ReauthLockedError(hit.retryAfterSec);
    return null;
  }

  await rateLimitClear(key);
  return person ?? null;
}

/** "in about 3 minutes" style phrasing for a retry-after value. */
export function retryPhrase(retryAfterSec: number): string {
  const mins = Math.ceil(retryAfterSec / 60);
  return mins <= 1 ? "in about a minute" : `in about ${mins} minutes`;
}
