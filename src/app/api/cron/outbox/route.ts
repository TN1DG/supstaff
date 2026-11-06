import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { authorizeCron } from "@/lib/cron";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/outbox";
import { pruneRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Drains the transactional outbox. Until the Salesforce / Saw-it / email
 * deliveries are wired (Phase 5) nothing is sent: each run records an attempt
 * and why it didn't go, and after `OUTBOX_MAX_ATTEMPTS` the row is parked as
 * `failed` so it shows up for managers (Service settings → Delivery queue)
 * instead of retrying forever. Protected by CRON_SECRET.
 *
 * Runs daily on Hobby; move to a tighter schedule in vercel.json once the
 * project is on a Pro plan and real delivery is enabled.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  // Housekeeping: drop stale brute-force counters while we're here.
  const prunedRateLimits = await pruneRateLimits();

  // One statement for the whole queue. Right-hand sides see the row's
  // pre-update values, so `attempts + 1` is this attempt's number.
  const attempted = await getDb()
    .update(outbox)
    .set({
      attempts: sql`${outbox.attempts} + 1`,
      lastAttemptAt: new Date(),
      lastError: sql`'Delivery to ' || ${outbox.target} || ' is not switched on yet'`,
      status: sql`case when ${outbox.attempts} + 1 >= ${OUTBOX_MAX_ATTEMPTS}
        then 'failed'::outbox_status else ${outbox.status} end`,
    })
    .where(eq(outbox.status, "pending"))
    .returning({ status: outbox.status });

  return NextResponse.json({
    ok: true,
    attempted: attempted.length,
    failed: attempted.filter((r) => r.status === "failed").length,
    prunedRateLimits,
    note: "External delivery not yet enabled (Phase 5).",
  });
}
