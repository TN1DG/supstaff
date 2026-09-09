import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimit } from "@/db/schema";

export type LimitOpts = {
  /** Allowed attempts inside the window before the key is blocked. */
  limit: number;
  /** Rolling window length, in seconds. */
  windowSec: number;
  /** How long to block once `limit` is exceeded. Defaults to `windowSec`. */
  lockoutSec?: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function blockedFor(lockedUntil: Date | null, now: number): number | null {
  if (!lockedUntil) return null;
  const remaining = lockedUntil.getTime() - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/**
 * Read-only check — does this key currently sit in a lockout? Use before doing
 * expensive work (e.g. an argon2 verify) so a locked key is cheap to reject.
 */
export async function rateLimitStatus(key: string): Promise<RateLimitResult> {
  const row = await getDb().query.rateLimit.findFirst({
    where: eq(rateLimit.key, key),
    columns: { lockedUntil: true },
  });
  const retryAfterSec = blockedFor(row?.lockedUntil ?? null, Date.now());
  return retryAfterSec ? { ok: false, retryAfterSec } : { ok: true };
}

/**
 * Count one attempt against `key`. Returns `{ ok: false }` when the key is (or
 * has just become) blocked. Call on every request for plain throttling, or only
 * on failures for brute-force lockout — pair the latter with `rateLimitClear`.
 */
export async function rateLimitHit(
  key: string,
  opts: LimitOpts,
): Promise<RateLimitResult> {
  const db = getDb();
  const now = Date.now();
  const windowSec = opts.windowSec;
  const lockoutSec = opts.lockoutSec ?? windowSec;

  // Single-statement upsert: reset the counter if the window has elapsed,
  // otherwise increment it, and arm the lockout once the limit is crossed.
  const rolledOver = sql`${rateLimit.windowStart} < now() - make_interval(secs => ${windowSec})`;
  const nextCount = sql`case when ${rolledOver} then 1 else ${rateLimit.count} + 1 end`;

  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, windowStart: new Date(now) })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: nextCount,
        windowStart: sql`case when ${rolledOver} then now() else ${rateLimit.windowStart} end`,
        lockedUntil: sql`case when ${nextCount} > ${opts.limit}
          then now() + make_interval(secs => ${lockoutSec})
          else ${rateLimit.lockedUntil} end`,
      },
    })
    .returning({ count: rateLimit.count, lockedUntil: rateLimit.lockedUntil });

  const retryAfterSec = blockedFor(row?.lockedUntil ?? null, now);
  if (retryAfterSec) return { ok: false, retryAfterSec };
  if (row && row.count > opts.limit) {
    return { ok: false, retryAfterSec: lockoutSec };
  }
  return { ok: true };
}

/** Drop the counter for `key` — call after a successful auth. */
export async function rateLimitClear(key: string): Promise<void> {
  await getDb().delete(rateLimit).where(eq(rateLimit.key, key));
}

/**
 * Remove rows whose window is long past and whose lockout (if any) has expired.
 * Wired into the outbox cron so the table stays small.
 */
export async function pruneRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await getDb()
    .delete(rateLimit)
    .where(
      and(
        lt(rateLimit.windowStart, cutoff),
        or(isNull(rateLimit.lockedUntil), lt(rateLimit.lockedUntil, new Date())),
      ),
    )
    .returning({ key: rateLimit.key });
  return deleted.length;
}
