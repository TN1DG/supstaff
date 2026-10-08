"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  nightCheckRounds,
  nightEvents,
  residents,
  shiftFollowUps,
  wakingNightShifts,
} from "@/db/schema";
import { assertCareStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { bySite } from "@/lib/db-scope";
import { fieldErrors, firstIssue } from "@/lib/forms";
import { appendHandoverNote } from "@/lib/handover-sync";
import { createReportInTx } from "@/lib/maintenance-sync";
import { enqueueOutbox } from "@/lib/outbox";
import { getSiteConfig } from "@/lib/site-settings";
import { nightSlotAt } from "@/lib/site-time";
import {
  NIGHT_EVENT_META,
  NIGHT_EVENT_SEVERITIES,
  NIGHT_EVENT_TYPES,
  followUpsFor,
} from "@/lib/waking-night/escalation";
import { isValidSlotTime } from "@/lib/waking-night/rounds";

function revalidateShift() {
  revalidatePath("/waking-night");
  revalidatePath("/handovers", "layout");
}

const eventSchema = z
  .object({
    type: z.enum(NIGHT_EVENT_TYPES),
    severity: z.enum(NIGHT_EVENT_SEVERITIES),
    residentId: z.uuid().optional(),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().min(3, "Describe what happened").max(4000),
    policeAttended: z.boolean(),
    occurredTime: z.string().refine(isValidSlotTime, "Use a time like 02:15"),
    roundId: z.uuid().optional(),
  })
  .refine((e) => e.type !== "emergency_repair" || !!e.location, {
    message: "Say where the repair is needed",
    path: ["location"],
  });

export type LogEventState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

/**
 * Log a night event and create its follow-ups in one transaction: the event,
 * its handover line, an urgent building report for an emergency repair, a
 * queued team email where one is needed, and each follow-up task.
 */
export async function logEvent(
  shiftId: string,
  _prev: LogEventState,
  formData: FormData,
): Promise<LogEventState> {
  const staffMember = await assertCareStaff();
  const parsed = eventSchema.safeParse({
    type: formData.get("type"),
    severity: formData.get("severity") ?? "minor_managed",
    residentId: formData.get("residentId") || undefined,
    location: formData.get("location") || undefined,
    description: formData.get("description") ?? "",
    policeAttended: formData.get("policeAttended") === "on",
    occurredTime: formData.get("occurredTime") ?? "",
    roundId: formData.get("roundId") || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const e = parsed.data;

  const db = getDb();
  const ctx = await requestContext();
  const shift = await db.query.wakingNightShifts.findFirst({
    where: bySite(wakingNightShifts, shiftId, staffMember.siteId),
    columns: { id: true, status: true, shiftDate: true },
  });
  if (!shift) return { error: "Shift not found." };
  if (shift.status !== "open") return { error: "This shift has been signed off." };

  const resident = e.residentId
    ? await db.query.residents.findFirst({
        where: bySite(residents, e.residentId, staffMember.siteId),
        columns: { id: true, firstName: true, lastName: true, preferredName: true, room: true },
      })
    : null;
  if (e.residentId && !resident) return { error: "Customer not found." };
  if (e.roundId) {
    const round = await db.query.nightCheckRounds.findFirst({
      where: bySite(nightCheckRounds, e.roundId, staffMember.siteId),
      columns: { id: true },
    });
    if (!round) return { error: "Round not found." };
  }

  const config = await getSiteConfig(staffMember.siteId);
  const occurredAt = nightSlotAt(shift.shiftDate, e.occurredTime, config.timezone);
  const now = new Date();
  if (occurredAt.getTime() > now.getTime() + 5 * 60_000) {
    return { fieldErrors: { occurredTime: "That time hasn't happened yet tonight." } };
  }

  const meta = NIGHT_EVENT_META[e.type];
  const residentName = resident
    ? `${resident.preferredName ?? resident.firstName} ${resident.lastName}`
    : null;
  const headline = `${meta.label}${e.severity === "serious" ? " (serious)" : ""}${
    residentName ? ` — ${residentName}` : ""
  }`;
  const acting = { id: staffMember.id, name: staffMember.name };

  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(nightEvents)
      .values({
        siteId: staffMember.siteId,
        shiftId,
        roundId: e.roundId ?? null,
        type: e.type,
        severity: e.severity,
        residentId: resident?.id ?? null,
        location: e.location ?? null,
        description: e.description,
        policeAttended: e.policeAttended,
        occurredAt,
        loggedByStaffId: staffMember.id,
      })
      .returning({ id: nightEvents.id });

    let reportId: string | null = null;
    if (e.type === "emergency_repair") {
      const report = await createReportInTx(
        tx,
        {
          title: `Emergency repair: ${e.description.slice(0, 80)}`,
          description: e.description,
          location: e.location!,
          roomNumber: null,
          category: "other",
          priority: "urgent",
        },
        { ...acting, siteId: staffMember.siteId },
        ctx,
      );
      reportId = report.id;
    }

    // Every event goes on the night handover (the customer's card when there is one).
    const line = `[Event · ${e.occurredTime}] ${headline}${e.location ? ` at ${e.location}` : ""}: ${
      e.description
    }${e.policeAttended ? " — police attended" : ""} (${staffMember.name})`;
    const { handoverId } = await appendHandoverNote(tx, {
      siteId: staffMember.siteId,
      handoverDate: shift.shiftDate,
      shift: "night",
      residentId: resident?.id ?? null,
      addendumPrefix: residentName
        ? `${residentName}${resident?.room ? ` (Room ${resident.room})` : ""}`
        : undefined,
      line,
      incidentFlag: true,
      staff: acting,
      ctx,
      auditAfter: { nightEventId: event.id, type: e.type },
    });
    await tx
      .update(nightEvents)
      .set({ maintenanceReportId: reportId, handoverId })
      .where(eq(nightEvents.id, event.id));

    for (const spec of followUpsFor(e)) {
      const auto =
        spec.auto === "repairs_log" && reportId
          ? { sourceEntityType: "maintenance_report", sourceEntityId: reportId }
          : spec.auto === "written_handover"
            ? { sourceEntityType: "handover", sourceEntityId: handoverId }
            : null;
      await tx.insert(shiftFollowUps).values({
        shiftId,
        eventId: event.id,
        kind: spec.kind,
        label: spec.label,
        allowNa: spec.allowNa,
        choices: spec.choices ?? null,
        ...(auto ? { status: "done" as const, resolvedAt: now, ...auto } : {}),
      });
      // The email is queued now; staff still confirm it went (decision 3).
      if (spec.kind === "email_team") {
        await enqueueOutbox(tx, {
          siteId: staffMember.siteId,
          target: "email",
          entityType: "night_event",
          entityId: event.id,
          payload: {
            kind: "night_event",
            to: config.teamEmail,
            subject: `${headline} — night of ${shift.shiftDate}`,
            body: line,
            handoverId,
          },
        });
      }
    }

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "waking_night.event",
        entityType: "night_event",
        entityId: event.id,
        after: { ...e, occurredAt: occurredAt.toISOString(), maintenanceReportId: reportId },
      },
      ctx,
    );
  });

  revalidateShift();
  return { ok: true };
}

const followUpSchema = z.object({
  status: z.enum(["done", "not_done", "na"]),
  choice: z.string().trim().max(40).optional(),
  reason: z.string().trim().max(500).optional(),
});

export type ResolveFollowUpState = { error?: string; ok?: boolean };

/** Mark a follow-up done (picking which number, where relevant), not done with a reason, or N/A. */
export async function resolveFollowUp(
  followUpId: string,
  _prev: ResolveFollowUpState,
  formData: FormData,
): Promise<ResolveFollowUpState> {
  const staffMember = await assertCareStaff();
  const parsed = followUpSchema.safeParse({
    status: formData.get("status"),
    choice: formData.get("choice") || undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { status, choice, reason } = parsed.data;

  const db = getDb();
  const ctx = await requestContext();
  const followUp = await db.query.shiftFollowUps.findFirst({
    where: eq(shiftFollowUps.id, followUpId),
    with: { shift: { columns: { siteId: true, status: true } } },
  });
  if (!followUp || followUp.shift.siteId !== staffMember.siteId) {
    return { error: "Follow-up not found." };
  }
  if (followUp.shift.status !== "open") return { error: "This shift has been signed off." };
  if (status === "not_done" && !reason) return { error: "Say why it wasn't done." };
  if (status === "na" && !followUp.allowNa) return { error: "This follow-up can't be marked N/A." };
  if (status === "done" && followUp.choices?.length && !followUp.choices.includes(choice ?? "")) {
    return { error: `Say which you did: ${followUp.choices.join(" or ")}.` };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(shiftFollowUps)
      .set({
        status,
        choice: status === "done" ? (choice ?? null) : null,
        reason: reason ?? null,
        resolvedByStaffId: staffMember.id,
        resolvedAt: now,
      })
      .where(eq(shiftFollowUps.id, followUpId));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "waking_night.follow_up",
        entityType: "shift_follow_up",
        entityId: followUpId,
        after: { kind: followUp.kind, status, choice, reason },
      },
      ctx,
    );
  });

  revalidateShift();
  return { ok: true };
}
