"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { maintenanceReports, maintenanceReportUpdates } from "@/db/schema";
import { assertBuildingManager } from "@/lib/rbac";
import { auditActor, requestContext, writeAudit } from "@/lib/audit";
import { bySite } from "@/lib/db-scope";
import { fieldErrors } from "@/lib/forms";
import { enqueueOutbox } from "@/lib/outbox";
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "@/lib/maintenance";
import { createReportInTx, sawitPayload } from "@/lib/maintenance-sync";
import { findingForSite } from "./queries";

const triageSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  assignedTo: z.string().trim().max(160).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type TriageFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Housing officer / manager moves a report along its lifecycle. Every save
 * appends a timeline row, audits before/after, and queues a Saw-it update —
 * all in one transaction. A save with nothing changed and no note is a no-op.
 */
export async function updateReport(
  reportId: string,
  _prev: TriageFormState,
  formData: FormData,
): Promise<TriageFormState> {
  const staff = await assertBuildingManager();
  const parsed = triageSchema.safeParse({
    status: formData.get("status"),
    priority: formData.get("priority"),
    assignedTo: formData.get("assignedTo") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.maintenanceReports.findFirst({
    where: bySite(maintenanceReports, reportId, staff.siteId),
  });
  if (!existing) return { error: "That report no longer exists." };

  const assignedTo = d.assignedTo || null;
  const note = d.note || null;
  const statusChanged = d.status !== existing.status;
  const changed =
    statusChanged || d.priority !== existing.priority || assignedTo !== existing.assignedTo;
  if (!changed && !note) return { error: "Nothing to save — change something or add a note." };

  const now = new Date();
  const patch = {
    status: d.status,
    priority: d.priority,
    assignedTo,
    updatedAt: now,
    // First time it leaves "open", stamp acknowledgement — even if it jumps straight to resolved.
    acknowledgedAt:
      existing.acknowledgedAt ?? (d.status !== "open" ? now : null),
    resolvedAt: d.status === "resolved" ? (existing.resolvedAt ?? now) : null,
    resolvedByStaffId:
      d.status === "resolved" ? (existing.resolvedByStaffId ?? staff.id) : null,
  };

  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(maintenanceReports)
        .set(patch)
        .where(eq(maintenanceReports.id, existing.id))
        .returning();

      await tx.insert(maintenanceReportUpdates).values({
        reportId: existing.id,
        staffId: staff.id,
        fromStatus: existing.status,
        toStatus: d.status,
        note,
      });

      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: statusChanged ? `maintenance.${d.status}` : "maintenance.update",
          entityType: "maintenance_report",
          entityId: existing.id,
          before: {
            status: existing.status,
            priority: existing.priority,
            assignedTo: existing.assignedTo,
          },
          after: { status: d.status, priority: d.priority, assignedTo, note },
        },
        ctx,
      );

      await enqueueOutbox(tx, {
        siteId: staff.siteId,
        target: "sawit",
        entityType: "maintenance_report",
        entityId: existing.id,
        payload: sawitPayload(updated, { event: "updated", actorName: staff.name, note }),
      });
    });
  } catch {
    return { error: "Could not save the update. Please try again." };
  }

  revalidatePath("/building");
  revalidatePath(`/building/${existing.id}`);
  revalidatePath("/maintenance");
  return { ok: true };
}

/**
 * Turn a night-check "Needs attention" into a tracked report. Idempotent per
 * finding: `sourceItemResultId` is unique, so a double-click (or two officers
 * at once) lands on the one report instead of creating a duplicate.
 */
export async function raiseFromFinding(itemResultId: string): Promise<void> {
  const staff = await assertBuildingManager();
  if (!z.string().uuid().safeParse(itemResultId).success) throw new Error("Bad finding id");

  const db = getDb();
  const finding = await findingForSite(staff.siteId, itemResultId);
  if (!finding || finding.status !== "attention" || finding.kind !== "simple") {
    throw new Error("That finding can't be raised as a report");
  }

  const already = await db.query.maintenanceReports.findFirst({
    where: eq(maintenanceReports.sourceItemResultId, finding.id),
    columns: { id: true },
  });
  if (already) redirect(`/building/${already.id}`);

  const ctx = await requestContext();
  let reportId: string;
  try {
    const report = await db.transaction((tx) =>
      createReportInTx(
        tx,
        {
          title: `${finding.area}: ${finding.description}`.slice(0, 160),
          description:
            [
              `Flagged on the ${finding.roundTime} night check (${finding.checkDate}).`,
              finding.note,
            ]
              .filter(Boolean)
              .join("\n\n") || null,
          location: finding.area,
          roomNumber: null,
          category: "other",
          priority: "normal",
          sourceItemResultId: finding.id,
        },
        staff,
        ctx,
      ),
    );
    reportId = report.id;
  } catch {
    // Lost a race on the unique source id — send them to the winner's report.
    const winner = await db.query.maintenanceReports.findFirst({
      where: eq(maintenanceReports.sourceItemResultId, finding.id),
      columns: { id: true },
    });
    if (!winner) throw new Error("Could not raise the report. Please try again.");
    reportId = winner.id;
  }

  revalidatePath("/building");
  redirect(`/building/${reportId}`);
}
