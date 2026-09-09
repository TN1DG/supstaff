import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { authorizeCron } from "@/lib/cron";
import { pruneRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Drains the transactional outbox. Until the Salesforce / Saw-it APIs are wired
 * (Phase 5), this simply ages out unsent rows and records attempts so the queue
 * is observable. Protected by CRON_SECRET.
 *
 * Runs daily on Hobby; move to a tighter schedule in vercel.json once the
 * project is on a Pro plan and real delivery is enabled.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const db = getDb();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);

  // Housekeeping: drop stale brute-force counters while we're here.
  const prunedRateLimits = await pruneRateLimits();

  const pending = await db.query.outbox.findMany({
    where: and(eq(outbox.status, "pending")),
    limit: 50,
  });

  let touched = 0;
  for (const row of pending) {
    // Placeholder: real delivery lands in Phase 5. For now, keep the row
    // pending but count the attempt so stuck items are visible.
    await db
      .update(outbox)
      .set({ attempts: row.attempts + 1, lastAttemptAt: new Date() })
      .where(and(eq(outbox.id, row.id), lt(outbox.attempts, 100)));
    touched++;
  }

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    touched,
    prunedRateLimits,
    note: "External delivery not yet enabled (Phase 5).",
    cutoff,
  });
}
