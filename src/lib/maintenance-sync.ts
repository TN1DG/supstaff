import type { DbOrTx } from "@/db";
import {
  maintenanceReports,
  maintenanceReportUpdates,
  type MaintenanceCategoryValue,
  type MaintenancePriorityValue,
  type MaintenanceReport,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";

type AuditCtx = { ip?: string | null; userAgent?: string | null };
type ActingStaff = { id: string; name: string; siteId: string };

export type NewReportInput = {
  title: string;
  description: string | null;
  location: string;
  roomNumber: number | null;
  category: MaintenanceCategoryValue;
  priority: MaintenancePriorityValue;
  sourceItemResultId?: string | null;
};

/** The shape Saw-it receives — flat, no internal staff ids. */
export function sawitPayload(
  report: Pick<
    MaintenanceReport,
    | "id"
    | "title"
    | "description"
    | "location"
    | "roomNumber"
    | "category"
    | "priority"
    | "status"
    | "assignedTo"
    | "createdAt"
    | "resolvedAt"
  >,
  extra: { event: "created" | "updated"; actorName: string; note?: string | null },
) {
  return {
    event: extra.event,
    reportId: report.id,
    title: report.title,
    description: report.description,
    location: report.location,
    roomNumber: report.roomNumber,
    category: report.category,
    priority: report.priority,
    status: report.status,
    assignedTo: report.assignedTo,
    reportedAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    actorName: extra.actorName,
    note: extra.note ?? null,
  };
}

/**
 * Insert a report, its first timeline row, the audit entry and the Saw-it
 * outbox row. Runs inside the caller's transaction so all four commit together.
 * Shared by staff capture (`/maintenance`) and "Raise report" on a night-check
 * finding (`/building`).
 */
export async function createReportInTx(
  tx: DbOrTx,
  input: NewReportInput,
  staff: ActingStaff,
  ctx: AuditCtx,
): Promise<MaintenanceReport> {
  const [report] = await tx
    .insert(maintenanceReports)
    .values({
      siteId: staff.siteId,
      title: input.title,
      description: input.description,
      location: input.location,
      roomNumber: input.roomNumber,
      category: input.category,
      priority: input.priority,
      sourceItemResultId: input.sourceItemResultId ?? null,
      reportedByStaffId: staff.id,
    })
    .returning();

  await tx.insert(maintenanceReportUpdates).values({
    reportId: report.id,
    staffId: staff.id,
    fromStatus: null,
    toStatus: report.status,
    note: input.sourceItemResultId ? "Raised from a night-check finding" : null,
  });

  await writeAudit(
    tx,
    {
      siteId: staff.siteId,
      actorStaffId: staff.id,
      actorName: staff.name,
      action: "maintenance.create",
      entityType: "maintenance_report",
      entityId: report.id,
      after: input,
    },
    ctx,
  );

  await enqueueOutbox(tx, {
    siteId: staff.siteId,
    target: "sawit",
    entityType: "maintenance_report",
    entityId: report.id,
    payload: sawitPayload(report, { event: "created", actorName: staff.name }),
  });

  return report;
}
