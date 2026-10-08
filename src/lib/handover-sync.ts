import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  handovers,
  handoverResidentEntries,
  handoverAddenda,
  residents,
  type HandoverStatusValue,
  type ShiftType,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";

const NARRATIVE_MAX = 8000; // matches entrySchema.narrative in handovers/actions.ts

type AuditCtx = { ip?: string | null; userAgent?: string | null };
type ActingStaff = { id: string; name: string };

/**
 * Find-or-create tonight's handover for a shift. Same *result* as
 * `startOrOpenHandover` in `handovers/actions.ts`, but a different
 * concurrency strategy on purpose: this runs **nested inside** a caller's own
 * transaction (`saveRoomCheck`'s), so it must never throw on a race —
 * `onConflictDoNothing` + re-select, instead of insert/catch/redirect, which
 * would abort the whole surrounding transaction (and silently drop the
 * room-check save with it) if two staff flagged rooms at the same moment.
 * Deliberately not shared code with `startOrOpenHandover` — that function is
 * the outermost thing in its own request and redirects; this one isn't and
 * doesn't.
 */
export async function findOrCreateHandoverInTx(
  tx: DbOrTx,
  params: {
    siteId: string;
    handoverDate: string;
    shift: ShiftType;
    staff: ActingStaff;
    ctx: AuditCtx;
  },
): Promise<{ id: string; status: HandoverStatusValue }> {
  const where = and(
    eq(handovers.siteId, params.siteId),
    eq(handovers.handoverDate, params.handoverDate),
    eq(handovers.shift, params.shift),
  );

  const existing = await tx.query.handovers.findFirst({
    where,
    columns: { id: true, status: true },
  });
  if (existing) return existing;

  const now = new Date();
  const [inserted] = await tx
    .insert(handovers)
    .values({
      siteId: params.siteId,
      handoverDate: params.handoverDate,
      shift: params.shift,
      startedByStaffId: params.staff.id,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [handovers.siteId, handovers.handoverDate, handovers.shift],
    })
    .returning({ id: handovers.id, status: handovers.status });

  if (!inserted) {
    // Lost the race — someone else's insert won; use theirs.
    const winner = await tx.query.handovers.findFirst({
      where,
      columns: { id: true, status: true },
    });
    if (!winner) throw new Error("Handover find-or-create raced with no winner found");
    return winner;
  }

  const activeResidents = await tx.query.residents.findMany({
    where: and(eq(residents.siteId, params.siteId), eq(residents.status, "active")),
    columns: { id: true },
  });
  if (activeResidents.length > 0) {
    await tx.insert(handoverResidentEntries).values(
      activeResidents.map((r) => ({
        handoverId: inserted.id,
        residentId: r.id,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  await writeAudit(
    tx,
    {
      siteId: params.siteId,
      actorStaffId: params.staff.id,
      actorName: params.staff.name,
      action: "handover.auto_start",
      entityType: "handover",
      entityId: inserted.id,
      after: { date: params.handoverDate, shift: params.shift, source: "night_check" },
    },
    params.ctx,
  );

  return inserted;
}

/**
 * Append one auto-generated line to a shift's handover: onto the resident's
 * card (or the house notes when there's no resident) while the handover is a
 * draft, or as an addendum once it's been submitted — addenda aren't
 * resident-scoped, so `addendumPrefix` names who it's about. Runs inside the
 * caller's transaction, like `findOrCreateHandoverInTx`.
 */
export async function appendHandoverNote(
  tx: DbOrTx,
  params: {
    siteId: string;
    handoverDate: string;
    shift: ShiftType;
    residentId: string | null;
    addendumPrefix?: string;
    line: string;
    /** Flag the resident's card as an incident. */
    incidentFlag: boolean;
    staff: ActingStaff;
    ctx: AuditCtx;
    auditAfter: Record<string, unknown>;
  },
): Promise<{ handoverId: string; asAddendum: boolean }> {
  const handover = await findOrCreateHandoverInTx(tx, {
    siteId: params.siteId,
    handoverDate: params.handoverDate,
    shift: params.shift,
    staff: params.staff,
    ctx: params.ctx,
  });
  const now = new Date();
  const append = (current: string | null | undefined) => {
    const combined = current ? `${current}\n${params.line}` : params.line;
    return combined.length > NARRATIVE_MAX
      ? combined.slice(combined.length - NARRATIVE_MAX)
      : combined;
  };

  if (handover.status === "draft") {
    if (params.residentId) {
      const current = await tx.query.handoverResidentEntries.findFirst({
        where: and(
          eq(handoverResidentEntries.handoverId, handover.id),
          eq(handoverResidentEntries.residentId, params.residentId),
        ),
        columns: { narrative: true },
      });
      const narrative = append(current?.narrative);
      const flag = params.incidentFlag ? { incidentFlag: true } : {};
      await tx
        .insert(handoverResidentEntries)
        .values({
          handoverId: handover.id,
          residentId: params.residentId,
          narrative,
          ...flag,
          lastEditedByStaffId: params.staff.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [handoverResidentEntries.handoverId, handoverResidentEntries.residentId],
          set: { narrative, ...flag, lastEditedByStaffId: params.staff.id, updatedAt: now },
        });
      await tx.update(handovers).set({ updatedAt: now }).where(eq(handovers.id, handover.id));
    } else {
      const current = await tx.query.handovers.findFirst({
        where: eq(handovers.id, handover.id),
        columns: { generalNotes: true },
      });
      await tx
        .update(handovers)
        .set({
          generalNotes: append(current?.generalNotes),
          generalNotesUpdatedAt: now,
          generalNotesByStaffId: params.staff.id,
          updatedAt: now,
        })
        .where(eq(handovers.id, handover.id));
    }
  } else {
    await tx.insert(handoverAddenda).values({
      handoverId: handover.id,
      authorStaffId: params.staff.id,
      body: params.addendumPrefix ? `${params.addendumPrefix} — ${params.line}` : params.line,
    });
  }

  const asAddendum = handover.status !== "draft";
  await writeAudit(
    tx,
    {
      siteId: params.siteId,
      actorStaffId: params.staff.id,
      actorName: params.staff.name,
      action: asAddendum ? "handover.auto_addendum" : "handover.auto_flag_entry",
      entityType: "handover",
      entityId: handover.id,
      after: params.auditAfter,
    },
    params.ctx,
  );
  return { handoverId: handover.id, asAddendum };
}

/**
 * Auto-write a night-check welfare flag into the resident's handover. Called
 * only when the room's flagged content actually changed — see the
 * idempotency check in `saveRoomCheck`.
 */
export async function writeNightCheckHandoverNote(
  tx: DbOrTx,
  params: {
    siteId: string;
    checkDate: string;
    residentId: string;
    residentName: string;
    roomNumber: number;
    situationLabels: string[];
    note: string | null;
    round: { id: string; roundTime: string };
    staff: ActingStaff;
    ctx: AuditCtx;
    timezone: string;
  },
): Promise<void> {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: params.timezone,
  }).format(new Date());
  const what =
    params.situationLabels.length > 0 ? params.situationLabels.join(", ") : "Note only";
  const line = `[Night check ${params.round.roundTime} · ${time}] Room ${params.roomNumber}: ${what}${
    params.note ? ` — "${params.note}"` : ""
  } (${params.staff.name})`;

  await appendHandoverNote(tx, {
    siteId: params.siteId,
    handoverDate: params.checkDate,
    shift: "night",
    residentId: params.residentId,
    addendumPrefix: `${params.residentName} (Room ${params.roomNumber})`,
    line,
    incidentFlag: true,
    staff: params.staff,
    ctx: params.ctx,
    auditAfter: {
      residentId: params.residentId,
      roomNumber: params.roomNumber,
      roundId: params.round.id,
    },
  });
}
