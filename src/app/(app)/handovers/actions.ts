"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  handoverAddenda,
  handoverAcknowledgements,
  handoverResidentEntries,
  handovers,
  residents,
} from "@/db/schema";
import { assertStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { pinCheck } from "@/lib/pin";
import { bySite } from "@/lib/db-scope";
import { buildHandoverPayload } from "@/lib/handover-payload";

const shiftValues = ["early", "late", "night"] as const;
type Shift = (typeof shiftValues)[number];

const entrySchema = z.object({
  narrative: z.string().max(8000).optional().or(z.literal("")),
  moodObservations: z.string().max(4000).optional().or(z.literal("")),
  tasksOutstanding: z.string().max(4000).optional().or(z.literal("")),
  appointments: z.string().max(4000).optional().or(z.literal("")),
  incidentFlag: z.boolean(),
});

/** One card (a resident entry, or the house notes) saved on its own. */
export type SectionSaveState = {
  ok?: boolean;
  /** ISO timestamp of the save — drives "Saved 14:33". */
  savedAt?: string;
  /** Name of whoever just saved (you). */
  editedBy?: string;
  error?: string;
  /** Set when someone else changed this section since it was loaded. */
  conflict?: { editedBy: string; at: string };
};

async function loadEditableHandover(id: string, siteId: string) {
  return getDb().query.handovers.findFirst({
    where: bySite(handovers, id, siteId),
  });
}

/**
 * Open the handover for a shift, creating it if no one has yet. There is exactly
 * one per (site, date, shift) — everyone on shift writes into the same record.
 */
export async function startOrOpenHandover(formData: FormData) {
  const staff = await assertStaff();
  const date = String(formData.get("handoverDate") ?? "");
  const shift = String(formData.get("shift") ?? "");
  if (!z.string().date().safeParse(date).success) return;
  if (!shiftValues.includes(shift as Shift)) return;

  const db = getDb();
  const findForShift = () =>
    db.query.handovers.findFirst({
      where: and(
        eq(handovers.siteId, staff.siteId),
        eq(handovers.handoverDate, date),
        eq(handovers.shift, shift as Shift),
      ),
      columns: { id: true },
    });

  const existing = await findForShift();
  if (existing) redirect(`/handovers/${existing.id}/edit`);

  const now = new Date();
  let newId: string;
  try {
    newId = await db.transaction(async (tx) => {
      const activeResidents = await tx.query.residents.findMany({
        where: and(
          eq(residents.siteId, staff.siteId),
          eq(residents.status, "active"),
        ),
        columns: { id: true },
      });

      const [row] = await tx
        .insert(handovers)
        .values({
          siteId: staff.siteId,
          handoverDate: date,
          shift: shift as Shift,
          startedByStaffId: staff.id,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: handovers.id });

      if (activeResidents.length > 0) {
        await tx.insert(handoverResidentEntries).values(
          activeResidents.map((r) => ({
            handoverId: row.id,
            residentId: r.id,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      await writeAudit(tx, {
        ...auditActor(staff),
        action: "handover.start",
        entityType: "handover",
        entityId: row.id,
        after: { date, shift },
      });

      return row.id;
    });
  } catch (err) {
    // Lost a race to open the shift — send them to the one that won.
    const raced = await findForShift();
    if (raced) redirect(`/handovers/${raced.id}/edit`);
    throw err;
  }

  redirect(`/handovers/${newId}/edit`);
}

/** Save one resident's card. Rejected (not overwritten) if it moved underneath you. */
export async function saveResidentEntry(
  handoverId: string,
  residentId: string,
  _prev: SectionSaveState,
  formData: FormData,
): Promise<SectionSaveState> {
  const staff = await assertStaff();
  const db = getDb();

  const handover = await db.query.handovers.findFirst({
    where: bySite(handovers, handoverId, staff.siteId),
    columns: { id: true, status: true },
  });
  if (!handover) return { error: "Handover not found." };
  if (handover.status !== "draft") {
    return { error: "This handover has been submitted — add a note instead." };
  }

  const resident = await db.query.residents.findFirst({
    where: bySite(residents, residentId, staff.siteId),
    columns: { id: true },
  });
  if (!resident) return { error: "Resident not found." };

  const parsed = entrySchema.safeParse({
    narrative: formData.get("narrative") ?? "",
    moodObservations: formData.get("mood") ?? "",
    tasksOutstanding: formData.get("tasks") ?? "",
    appointments: formData.get("appts") ?? "",
    incidentFlag: formData.get("incident") === "on",
  });
  if (!parsed.success) {
    return { error: "That's longer than a handover note should be — please trim it." };
  }

  const expected = String(formData.get("expectedUpdatedAt") ?? "");
  const ctx = await requestContext();
  const now = new Date();
  const values = {
    narrative: parsed.data.narrative || null,
    moodObservations: parsed.data.moodObservations || null,
    tasksOutstanding: parsed.data.tasksOutstanding || null,
    appointments: parsed.data.appointments || null,
    incidentFlag: parsed.data.incidentFlag,
    lastEditedByStaffId: staff.id,
    updatedAt: now,
  };

  const outcome = await db.transaction(async (tx) => {
    const current = await tx.query.handoverResidentEntries.findFirst({
      where: and(
        eq(handoverResidentEntries.handoverId, handoverId),
        eq(handoverResidentEntries.residentId, residentId),
      ),
      columns: { updatedAt: true },
      with: { lastEditedBy: { columns: { name: true } } },
    });

    if (
      current &&
      expected &&
      String(current.updatedAt.getTime()) !== expected
    ) {
      return {
        conflict: {
          editedBy: current.lastEditedBy?.name ?? "someone",
          at: current.updatedAt.toISOString(),
        },
      } as const;
    }

    await tx
      .insert(handoverResidentEntries)
      .values({ handoverId, residentId, createdAt: now, ...values })
      .onConflictDoUpdate({
        target: [
          handoverResidentEntries.handoverId,
          handoverResidentEntries.residentId,
        ],
        set: values,
      });

    await tx
      .update(handovers)
      .set({ updatedAt: now })
      .where(eq(handovers.id, handoverId));

    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "handover.edit_entry",
        entityType: "handover",
        entityId: handoverId,
        after: { residentId, incident: parsed.data.incidentFlag },
      },
      ctx,
    );

    return { ok: true } as const;
  });

  if ("conflict" in outcome) return { conflict: outcome.conflict };

  revalidatePath(`/handovers/${handoverId}/edit`);
  revalidatePath(`/handovers/${handoverId}`);
  return { ok: true, savedAt: now.toISOString(), editedBy: staff.name };
}

/** Save the shared house-notes block. Same conflict handling as a resident card. */
export async function saveHouseNotes(
  handoverId: string,
  _prev: SectionSaveState,
  formData: FormData,
): Promise<SectionSaveState> {
  const staff = await assertStaff();
  const db = getDb();

  const parsed = z
    .string()
    .max(10000)
    .safeParse(String(formData.get("generalNotes") ?? ""));
  if (!parsed.success) {
    return { error: "House notes are longer than the form allows — please trim." };
  }

  const handover = await db.query.handovers.findFirst({
    where: bySite(handovers, handoverId, staff.siteId),
    columns: { id: true, status: true, generalNotesUpdatedAt: true },
    with: { generalNotesBy: { columns: { name: true } } },
  });
  if (!handover) return { error: "Handover not found." };
  if (handover.status !== "draft") {
    return { error: "This handover has been submitted — add a note instead." };
  }

  const expected = String(formData.get("expectedUpdatedAt") ?? "");
  if (
    handover.generalNotesUpdatedAt &&
    expected &&
    String(handover.generalNotesUpdatedAt.getTime()) !== expected
  ) {
    return {
      conflict: {
        editedBy: handover.generalNotesBy?.name ?? "someone",
        at: handover.generalNotesUpdatedAt.toISOString(),
      },
    };
  }

  const ctx = await requestContext();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(handovers)
      .set({
        generalNotes: parsed.data || null,
        generalNotesUpdatedAt: now,
        generalNotesByStaffId: staff.id,
        updatedAt: now,
      })
      .where(eq(handovers.id, handoverId));

    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "handover.edit_notes",
        entityType: "handover",
        entityId: handoverId,
      },
      ctx,
    );
  });

  revalidatePath(`/handovers/${handoverId}/edit`);
  revalidatePath(`/handovers/${handoverId}`);
  return { ok: true, savedAt: now.toISOString(), editedBy: staff.name };
}

export async function submitHandover(
  handoverId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const pin = String(formData.get("pin") ?? "");

  const db = getDb();
  const ctx = await requestContext();

  const existing = await loadEditableHandover(handoverId, staff.siteId);
  if (!existing) return { error: "Handover not found." };
  if (existing.status !== "draft") return { error: "Already submitted." };

  const pinError = await pinCheck(staff.id, pin);
  if (pinError) return { error: pinError };

  const payload = await buildHandoverPayload(handoverId, staff.siteId);

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(handovers)
      .set({
        status: "submitted",
        submittedAt: now,
        submittedByStaffId: staff.id,
        updatedAt: now,
      })
      .where(eq(handovers.id, handoverId));
    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "handover.submit",
        entityType: "handover",
        entityId: handoverId,
      },
      ctx,
    );
    await enqueueOutbox(tx, {
      siteId: staff.siteId,
      target: "salesforce",
      entityType: "handover",
      entityId: handoverId,
      payload,
    });
  });

  revalidatePath("/handovers");
  revalidatePath(`/handovers/${handoverId}`);
  return {};
}

export async function addAddendum(
  handoverId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const body = String(formData.get("body") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  if (body.length < 2) return { error: "Write the note first." };
  if (body.length > 4000) return { error: "That note is too long." };

  const db = getDb();
  const ctx = await requestContext();
  const existing = await loadEditableHandover(handoverId, staff.siteId);
  if (!existing) return { error: "Handover not found." };
  if (existing.status === "draft") {
    return { error: "Edit the draft directly — addenda are for submitted handovers." };
  }

  const pinError = await pinCheck(staff.id, pin);
  if (pinError) return { error: pinError };

  await db.transaction(async (tx) => {
    await tx.insert(handoverAddenda).values({
      handoverId,
      authorStaffId: staff.id,
      body,
    });
    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "handover.add_addendum",
        entityType: "handover",
        entityId: handoverId,
      },
      ctx,
    );
  });

  revalidatePath(`/handovers/${handoverId}`);
  return {};
}

export async function acknowledgeHandover(handoverId: string) {
  const staff = await assertStaff();
  const db = getDb();

  const existing = await db.query.handovers.findFirst({
    where: bySite(handovers, handoverId, staff.siteId),
    columns: { id: true, status: true },
  });
  if (!existing || existing.status === "draft") return;

  await db
    .insert(handoverAcknowledgements)
    .values({ handoverId, staffId: staff.id })
    .onConflictDoNothing();

  revalidatePath(`/handovers/${handoverId}`);
}
