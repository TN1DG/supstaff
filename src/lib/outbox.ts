import { schema, type DbOrTx } from "@/db";

export type OutboxTarget = "salesforce" | "sawit" | "email";

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
