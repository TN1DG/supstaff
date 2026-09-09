import { headers } from "next/headers";
import { schema, type DbOrTx } from "@/db";
import { clientIp } from "@/lib/http";

export type AuditInput = {
  siteId?: string | null;
  actorStaffId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function requestContext() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}

/** The actor fields every audit row needs, pulled off the session staff. */
export function auditActor(s: { id: string; name: string; siteId: string }) {
  return { siteId: s.siteId, actorStaffId: s.id, actorName: s.name };
}

/**
 * Write an audit row. Pass the surrounding transaction (`tx`) so the audit
 * entry commits or rolls back atomically with the mutation it records.
 */
export async function writeAudit(
  db: DbOrTx,
  input: AuditInput,
  ctx?: { ip?: string | null; userAgent?: string | null },
) {
  const context = ctx ?? (await requestContext());
  await db.insert(schema.auditLog).values({
    siteId: input.siteId ?? null,
    actorStaffId: input.actorStaffId ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });
}
