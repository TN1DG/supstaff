import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/db";

export type OutboxTarget = "salesforce" | "sawit" | "email";

/** The drain runs daily, so a row is retried for a week before it's parked as `failed`. */
export const OUTBOX_MAX_ATTEMPTS = 7;

/**
 * Queue an item for delivery to an external system (Salesforce, Saw-it, email).
 * Call inside the same transaction as the mutation it relates to so the queue
 * row never exists without its source record (transactional outbox pattern).
 * A cron job drains the queue — see src/app/api/cron/outbox.
 */
export async function enqueueOutbox(
  db: DbOrTx,
  input: {
    siteId?: string | null;
    target: OutboxTarget;
    entityType: string;
    entityId: string;
    payload: unknown;
  },
) {
  await db.insert(schema.outbox).values({
    siteId: input.siteId ?? null,
    target: input.target,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload as object,
    status: "pending",
  });
}

/** Queue counts by status, plus the most recent failures, for the manager view. */
export async function loadOutboxHealth(siteId: string) {
  const { outbox } = schema;
  const db = getDb();
  const [counts, failed] = await Promise.all([
    db
      .select({ status: outbox.status, n: count() })
      .from(outbox)
      .where(eq(outbox.siteId, siteId))
      .groupBy(outbox.status),
    db.query.outbox.findMany({
      where: and(eq(outbox.siteId, siteId), eq(outbox.status, "failed")),
      columns: {
        id: true,
        target: true,
        entityType: true,
        attempts: true,
        lastError: true,
        lastAttemptAt: true,
        createdAt: true,
      },
      orderBy: [desc(outbox.lastAttemptAt)],
      limit: 20,
    }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  return {
    pending: (byStatus.pending ?? 0) + (byStatus.processing ?? 0),
    sent: byStatus.sent ?? 0,
    failed: byStatus.failed ?? 0,
    recentFailures: failed,
  };
}
