"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  nightCheckItemResults,
  nightCheckRoomChecks,
  nightCheckRoomSituations,
  nightCheckRounds,
  nightCheckSituationTypes,
  nightCheckTemplateItems,
  residents,
} from "@/db/schema";
import { assertRole, assertCareStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { pinCheck } from "@/lib/pin";
import { bySite } from "@/lib/db-scope";
import { fieldErrors, firstIssue } from "@/lib/forms";
import { ALL_FLOORS, isValidRoomNumber } from "@/lib/night-checks";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf, nightSlotAt } from "@/lib/site-time";
import {
  LAST_ROUND_GRACE_MINUTES,
  buildRoundSchedule,
  needsReason,
  roundTimeliness,
} from "@/lib/waking-night/rounds";
import { seedRoundContents } from "@/lib/waking-night/round-store";
import { writeNightCheckHandoverNote } from "@/lib/handover-sync";

const itemStatusValues = ["ok", "attention", "na"] as const;

/**
 * Check in to a round. The night and the slot's time are computed server-side
 * (the button only says which slot), so there's nothing here for a tampered
 * form to lie about. If the waking-night shift pre-created a `scheduled` row,
 * check-in claims it; otherwise the row is created now.
 */
export async function checkInRound(formData: FormData) {
  const staffMember = await assertCareStaff();
  const roundTime = String(formData.get("roundTime") ?? "");
  const now = new Date();
  const config = await getSiteConfig(staffMember.siteId);
  const checkDate = nightOf(now, config.timezone);

  const db = getDb();
  const findExisting = () =>
    db.query.nightCheckRounds.findFirst({
      where: and(
        eq(nightCheckRounds.siteId, staffMember.siteId),
        eq(nightCheckRounds.checkDate, checkDate),
        eq(nightCheckRounds.roundTime, roundTime),
      ),
      columns: { id: true, status: true },
    });

  const existing = await findExisting();
  if (existing && existing.status !== "scheduled") redirect(`/night-checks/${existing.id}`);
  const slot = buildRoundSchedule(config.roundTimes, checkDate, config.timezone).find(
    (s) => s.roundTime === roundTime,
  );
  if (!existing && !slot) return;

  let roundId: string;
  try {
    roundId = await db.transaction(async (tx) => {
      let id: string;
      if (existing) {
        // Conditional on still being `scheduled`, so two people checking in
        // at once can't both claim it.
        const [claimed] = await tx
          .update(nightCheckRounds)
          .set({ staffId: staffMember.id, startedAt: now, status: "in_progress", updatedAt: now })
          .where(
            and(eq(nightCheckRounds.id, existing.id), eq(nightCheckRounds.status, "scheduled")),
          )
          .returning({ id: nightCheckRounds.id });
        if (!claimed) return existing.id;
        id = claimed.id;
      } else {
        const [row] = await tx
          .insert(nightCheckRounds)
          .values({
            siteId: staffMember.siteId,
            checkDate,
            roundTime,
            scheduledAt: slot!.scheduledAt,
            staffId: staffMember.id,
            startedAt: now,
            status: "in_progress",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: nightCheckRounds.id });
        id = row.id;
      }

      await seedRoundContents(tx, staffMember.siteId, id, now);

      await writeAudit(tx, {
        ...auditActor(staffMember),
        action: "night_check.start",
        entityType: "night_check_round",
        entityId: id,
        after: { checkDate, roundTime },
      });

      return id;
    });
  } catch (err) {
    // Lost a race to check in — send them to the round that won.
    const raced = await findExisting();
    if (raced) redirect(`/night-checks/${raced.id}`);
    throw err;
  }

  redirect(`/night-checks/${roundId}`);
}

export type SaveItemsState = { ok?: boolean; error?: string };

/** Save the whole checklist in one go — a round is walked by one person, so there's no conflict case to handle. */
export async function saveRoundItems(
  roundId: string,
  _prev: SaveItemsState,
  formData: FormData,
): Promise<SaveItemsState> {
  const staffMember = await assertCareStaff();
  const db = getDb();

  const round = await db.query.nightCheckRounds.findFirst({
    where: bySite(nightCheckRounds, roundId, staffMember.siteId),
    columns: { id: true, status: true },
  });
  if (!round) return { error: "Round not found." };
  if (round.status !== "in_progress") {
    return { error: "This round is already complete." };
  }

  // Resident-welfare items don't appear in this form (they're saved per-room
  // via saveRoomCheck) — excluding them here stops this loop from clobbering
  // their derived status back to null every time the generic checklist saves.
  const items = await db.query.nightCheckItemResults.findMany({
    where: eq(nightCheckItemResults.roundId, roundId),
    columns: { id: true, templateItemId: true },
    with: { templateItem: { columns: { kind: true } } },
  });
  const simpleItems = items.filter((i) => i.templateItem.kind !== "resident_welfare");

  const ctx = await requestContext();
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const item of simpleItems) {
      const statusRaw = formData.get(`status_${item.templateItemId}`);
      const parsedStatus = z
        .enum(itemStatusValues)
        .nullable()
        .safeParse(statusRaw || null);
      const noteRaw = formData.get(`note_${item.templateItemId}`);
      const note =
        typeof noteRaw === "string" ? noteRaw.trim().slice(0, 2000) : "";

      await tx
        .update(nightCheckItemResults)
        .set({
          status: parsedStatus.success ? parsedStatus.data : null,
          note: note || null,
          updatedAt: now,
        })
        .where(eq(nightCheckItemResults.id, item.id));
    }

    await tx
      .update(nightCheckRounds)
      .set({ updatedAt: now })
      .where(eq(nightCheckRounds.id, roundId));

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check.save_items",
        entityType: "night_check_round",
        entityId: roundId,
      },
      ctx,
    );
  });

  revalidatePath(`/night-checks/${roundId}`);
  return { ok: true };
}

export type SaveRoomCheckState = { ok?: boolean; error?: string };

/**
 * Save one room's welfare check — independent per-room save (staff walks
 * rooms one at a time), not bundled into `saveRoundItems`. Recomputes the
 * parent resident-welfare item's derived status in the same transaction, and
 * — only when this room's flagged content actually changed — writes a note
 * into the resident's handover for the night.
 */
export async function saveRoomCheck(
  roundId: string,
  templateItemId: string,
  roomNumber: number,
  _prev: SaveRoomCheckState,
  formData: FormData,
): Promise<SaveRoomCheckState> {
  const staffMember = await assertCareStaff();
  if (!isValidRoomNumber(roomNumber)) return { error: "Not a real room." };
  const { timezone } = await getSiteConfig(staffMember.siteId);
  const db = getDb();

  const round = await db.query.nightCheckRounds.findFirst({
    where: bySite(nightCheckRounds, roundId, staffMember.siteId),
    columns: { id: true, status: true, checkDate: true, roundTime: true },
  });
  if (!round) return { error: "Round not found." };
  if (round.status !== "in_progress") {
    return { error: "This round is already complete." };
  }

  // Never trust bound action args — confirm the item is really this round's
  // resident-welfare item before writing anything against it.
  const item = await db.query.nightCheckItemResults.findFirst({
    where: and(
      eq(nightCheckItemResults.roundId, roundId),
      eq(nightCheckItemResults.templateItemId, templateItemId),
    ),
    columns: {},
    with: { templateItem: { columns: { kind: true, siteId: true } } },
  });
  if (
    !item ||
    item.templateItem.siteId !== staffMember.siteId ||
    item.templateItem.kind !== "resident_welfare"
  ) {
    return { error: "Checklist item not found." };
  }

  const activeSituations = await db.query.nightCheckSituationTypes.findMany({
    where: and(
      eq(nightCheckSituationTypes.siteId, staffMember.siteId),
      eq(nightCheckSituationTypes.active, true),
    ),
    columns: { id: true, label: true },
  });
  const activeIds = new Set(activeSituations.map((s) => s.id));
  const submittedIds = formData.getAll("situationTypeId").map(String);
  const newSituationIds = [...new Set(submittedIds.filter((id) => activeIds.has(id)))];
  const situationLabels = activeSituations
    .filter((s) => newSituationIds.includes(s.id))
    .map((s) => s.label);

  const noteRaw = formData.get("note");
  const newNote = (typeof noteRaw === "string" ? noteRaw.trim() : "").slice(0, 2000) || null;

  const ctx = await requestContext();
  const now = new Date();

  await db.transaction(async (tx) => {
    const existing = await tx.query.nightCheckRoomChecks.findFirst({
      where: and(
        eq(nightCheckRoomChecks.roundId, roundId),
        eq(nightCheckRoomChecks.roomNumber, roomNumber),
      ),
      columns: { id: true, note: true },
      with: { situations: { columns: { situationTypeId: true } } },
    });
    const oldSituationIds = new Set(
      existing?.situations.map((s) => s.situationTypeId) ?? [],
    );
    const oldNote = existing?.note ?? null;

    const [roomCheck] = await tx
      .insert(nightCheckRoomChecks)
      .values({
        roundId,
        templateItemId,
        roomNumber,
        note: newNote,
        lastEditedByStaffId: staffMember.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [nightCheckRoomChecks.roundId, nightCheckRoomChecks.roomNumber],
        set: { note: newNote, lastEditedByStaffId: staffMember.id, updatedAt: now },
      })
      .returning({ id: nightCheckRoomChecks.id });

    await tx
      .delete(nightCheckRoomSituations)
      .where(eq(nightCheckRoomSituations.roomCheckId, roomCheck.id));
    if (newSituationIds.length > 0) {
      await tx.insert(nightCheckRoomSituations).values(
        newSituationIds.map((situationTypeId) => ({
          roomCheckId: roomCheck.id,
          situationTypeId,
          createdAt: now,
        })),
      );
    }

    // Only fire the handover write when this room's flagged content is new
    // or has changed — never on an unchanged re-save, never on un-flagging.
    const sameSet =
      oldSituationIds.size === newSituationIds.length &&
      newSituationIds.every((id) => oldSituationIds.has(id));
    const newFlagged = newSituationIds.length > 0 || !!newNote;
    const oldFlagged = oldSituationIds.size > 0 || !!oldNote;
    const contentChanged = !sameSet || oldNote !== newNote;
    const shouldWriteHandover = newFlagged && (!oldFlagged || contentChanged);

    const roomChecks = await tx.query.nightCheckRoomChecks.findMany({
      where: eq(nightCheckRoomChecks.roundId, roundId),
      columns: { note: true },
      with: { situations: { columns: { id: true } } },
    });
    const anyFlagged = roomChecks.some(
      (r) => (r.note && r.note.trim()) || r.situations.length > 0,
    );
    await tx
      .update(nightCheckItemResults)
      .set({ status: anyFlagged ? "attention" : "ok", updatedAt: now })
      .where(
        and(
          eq(nightCheckItemResults.roundId, roundId),
          eq(nightCheckItemResults.templateItemId, templateItemId),
        ),
      );

    await tx
      .update(nightCheckRounds)
      .set({ updatedAt: now })
      .where(eq(nightCheckRounds.id, roundId));

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check.save_room",
        entityType: "night_check_round",
        entityId: roundId,
        after: { roomNumber, situationTypeIds: newSituationIds, note: newNote, flagged: newFlagged },
      },
      ctx,
    );

    if (shouldWriteHandover) {
      const matches = await tx.query.residents.findMany({
        where: and(
          eq(residents.siteId, staffMember.siteId),
          eq(residents.status, "active"),
          eq(residents.room, String(roomNumber)),
        ),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
        },
      });
      for (const resident of matches) {
        await writeNightCheckHandoverNote(tx, {
          siteId: staffMember.siteId,
          checkDate: round.checkDate,
          residentId: resident.id,
          residentName: `${resident.preferredName ?? resident.firstName} ${resident.lastName}`,
          roomNumber,
          situationLabels,
          note: newNote,
          round: { id: round.id, roundTime: round.roundTime },
          staff: { id: staffMember.id, name: staffMember.name },
          ctx,
          timezone,
        });
      }
    }
  });

  revalidatePath(`/night-checks/${roundId}`);
  return { ok: true };
}

const completeSchema = z.object({
  floors: z
    .array(z.coerce.number().int())
    .min(1, "Tick at least one floor you walked.")
    .refine((fs) => fs.every((f) => ALL_FLOORS.includes(f)), "Unknown floor."),
  observations: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** When a round was due and when it stops being recoverable, for timeliness. */
async function roundTiming(
  siteId: string,
  round: { checkDate: string; roundTime: string; scheduledAt: Date | null },
) {
  const config = await getSiteConfig(siteId);
  const slot = buildRoundSchedule(config.roundTimes, round.checkDate, config.timezone).find(
    (s) => s.roundTime === round.roundTime,
  );
  const scheduledAt =
    round.scheduledAt ??
    slot?.scheduledAt ??
    nightSlotAt(round.checkDate, round.roundTime, config.timezone);
  const cutoff =
    slot?.cutoff ?? new Date(scheduledAt.getTime() + LAST_ROUND_GRACE_MINUTES * 60_000);
  return { scheduledAt, cutoff, toleranceMinutes: config.roundToleranceMinutes };
}

export async function completeRound(
  roundId: string,
  formData: FormData,
): Promise<{ error?: string; reasonRequired?: boolean }> {
  const staffMember = await assertCareStaff();
  const pin = String(formData.get("pin") ?? "");
  const db = getDb();
  const ctx = await requestContext();

  const parsed = completeSchema.safeParse({
    floors: formData.getAll("floors"),
    observations: formData.get("observations") || undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const round = await db.query.nightCheckRounds.findFirst({
    where: bySite(nightCheckRounds, roundId, staffMember.siteId),
    columns: { id: true, status: true, checkDate: true, roundTime: true, scheduledAt: true },
    with: {
      items: {
        columns: { status: true, note: true },
        with: { templateItem: { columns: { kind: true } } },
      },
    },
  });
  if (!round) return { error: "Round not found." };
  if (round.status !== "in_progress") return { error: "Already completed." };

  const unanswered = round.items.filter((i) => !i.status).length;
  if (unanswered > 0) {
    return {
      error: `${unanswered} item${unanswered === 1 ? "" : "s"} still need an answer.`,
    };
  }
  // The resident-welfare item's status is derived, not staff-typed — its
  // real detail lives per-room, not in this item's own `note` column.
  const missingNote = round.items.some(
    (i) =>
      i.status === "attention" &&
      i.templateItem.kind !== "resident_welfare" &&
      !i.note?.trim(),
  );
  if (missingNote) {
    return { error: "Add a note for anything flagged as needing attention." };
  }

  const now = new Date();
  const timeliness = roundTimeliness({ ...(await roundTiming(staffMember.siteId, round)), completedAt: now });
  const reason = parsed.data.reason || null;
  if (needsReason(timeliness) && !reason) {
    return {
      reasonRequired: true,
      error: `This round is ${timeliness === "late" ? "outside its time window" : "past its window"} — say why before completing it.`,
    };
  }

  const pinError = await pinCheck(staffMember.id, pin);
  if (pinError) return { error: pinError };

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckRounds)
      .set({
        status: "complete",
        completedAt: now,
        completedByStaffId: staffMember.id,
        floorsCovered: [...new Set(parsed.data.floors)].sort(),
        observations: parsed.data.observations || null,
        timeliness,
        timelinessReason: needsReason(timeliness) ? reason : null,
        updatedAt: now,
      })
      .where(eq(nightCheckRounds.id, roundId));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check.complete",
        entityType: "night_check_round",
        entityId: roundId,
        after: { timeliness, floorsCovered: parsed.data.floors, reason },
      },
      ctx,
    );
  });

  revalidatePath("/night-checks");
  revalidatePath(`/night-checks/${roundId}`);
  revalidatePath("/waking-night");
  return {};
}

export type RoundReasonState = { error?: string; ok?: boolean };

/**
 * Explain a late or missed round after the fact. A `scheduled` round past its
 * cutoff is recorded as missed here, so the reason always has a verdict to
 * belong to.
 */
export async function setRoundReason(
  roundId: string,
  _prev: RoundReasonState,
  formData: FormData,
): Promise<RoundReasonState> {
  const staffMember = await assertCareStaff();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Give a short reason." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };

  const db = getDb();
  const ctx = await requestContext();
  const round = await db.query.nightCheckRounds.findFirst({
    where: bySite(nightCheckRounds, roundId, staffMember.siteId),
    columns: {
      id: true,
      status: true,
      checkDate: true,
      roundTime: true,
      scheduledAt: true,
      completedAt: true,
      timeliness: true,
    },
  });
  if (!round) return { error: "Round not found." };

  const now = new Date();
  const timing = await roundTiming(staffMember.siteId, round);
  const timeliness =
    round.timeliness ??
    (round.completedAt || now >= timing.cutoff
      ? roundTimeliness({ ...timing, completedAt: round.completedAt })
      : null);
  if (!needsReason(timeliness)) return { error: "This round isn't late or missed." };

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckRounds)
      .set({
        timeliness,
        timelinessReason: reason,
        // An untouched round past its cutoff is now on record as missed.
        ...(round.status === "scheduled" ? { status: "missed" as const } : {}),
        updatedAt: now,
      })
      .where(eq(nightCheckRounds.id, roundId));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check.reason",
        entityType: "night_check_round",
        entityId: roundId,
        after: { timeliness, reason },
      },
      ctx,
    );
  });

  revalidatePath("/night-checks");
  revalidatePath(`/night-checks/${roundId}`);
  revalidatePath("/waking-night");
  return { ok: true };
}

/* -------------------------------------------------------------------- */
/* Checklist template (manager)                                          */
/* -------------------------------------------------------------------- */

const templateItemSchema = z.object({
  area: z.string().trim().min(1, "Area is required").max(120),
  description: z.string().trim().min(1, "Description is required").max(500),
});

export type TemplateItemFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export async function createTemplateItem(
  _prev: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  const staffMember = await assertRole("manager");
  const parsed = templateItemSchema.safeParse({
    area: formData.get("area"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    const existing = await tx.query.nightCheckTemplateItems.findMany({
      where: eq(nightCheckTemplateItems.siteId, staffMember.siteId),
      columns: { sortOrder: true },
    });
    const nextOrder =
      existing.length > 0
        ? Math.max(...existing.map((e) => e.sortOrder)) + 1
        : 0;

    const [row] = await tx
      .insert(nightCheckTemplateItems)
      .values({
        siteId: staffMember.siteId,
        area: parsed.data.area,
        description: parsed.data.description,
        sortOrder: nextOrder,
      })
      .returning({ id: nightCheckTemplateItems.id });

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_template.create",
        entityType: "night_check_template_item",
        entityId: row.id,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
  return { ok: true };
}

export async function updateTemplateItem(
  id: string,
  _prev: TemplateItemFormState,
  formData: FormData,
): Promise<TemplateItemFormState> {
  const staffMember = await assertRole("manager");
  const parsed = templateItemSchema.safeParse({
    area: formData.get("area"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();
  const existing = await db.query.nightCheckTemplateItems.findFirst({
    where: bySite(nightCheckTemplateItems, id, staffMember.siteId),
  });
  if (!existing) return { error: "Checklist item not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckTemplateItems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(nightCheckTemplateItems.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_template.update",
        entityType: "night_check_template_item",
        entityId: id,
        before: existing,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
  return { ok: true };
}

export async function setTemplateItemActive(id: string, active: boolean) {
  const staffMember = await assertRole("manager");
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.nightCheckTemplateItems.findFirst({
    where: bySite(nightCheckTemplateItems, id, staffMember.siteId),
  });
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckTemplateItems)
      .set({ active, updatedAt: new Date() })
      .where(eq(nightCheckTemplateItems.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: active
          ? "night_check_template.restore"
          : "night_check_template.archive",
        entityType: "night_check_template_item",
        entityId: id,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
}

/** Swap sort order with the item immediately before/after it (site-scoped, active list). */
export async function moveTemplateItem(id: string, direction: "up" | "down") {
  const staffMember = await assertRole("manager");
  const db = getDb();

  const items = await db.query.nightCheckTemplateItems.findMany({
    where: and(
      eq(nightCheckTemplateItems.siteId, staffMember.siteId),
      eq(nightCheckTemplateItems.active, true),
    ),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
    columns: { id: true, sortOrder: true },
  });

  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  const a = items[idx];
  const b = items[swapIdx];

  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckTemplateItems)
      .set({ sortOrder: b.sortOrder, updatedAt: new Date() })
      .where(eq(nightCheckTemplateItems.id, a.id));
    await tx
      .update(nightCheckTemplateItems)
      .set({ sortOrder: a.sortOrder, updatedAt: new Date() })
      .where(eq(nightCheckTemplateItems.id, b.id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_template.reorder",
        entityType: "night_check_template_item",
        entityId: a.id,
        before: { sortOrder: a.sortOrder },
        after: { sortOrder: b.sortOrder, direction },
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
}

/* -------------------------------------------------------------------- */
/* Welfare situation types (manager)                                     */
/* -------------------------------------------------------------------- */

const situationTypeSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(120),
});

export type SituationTypeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export async function createSituationType(
  _prev: SituationTypeFormState,
  formData: FormData,
): Promise<SituationTypeFormState> {
  const staffMember = await assertRole("manager");
  const parsed = situationTypeSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    const existing = await tx.query.nightCheckSituationTypes.findMany({
      where: eq(nightCheckSituationTypes.siteId, staffMember.siteId),
      columns: { sortOrder: true },
    });
    const nextOrder =
      existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 0;

    const [row] = await tx
      .insert(nightCheckSituationTypes)
      .values({
        siteId: staffMember.siteId,
        label: parsed.data.label,
        sortOrder: nextOrder,
      })
      .returning({ id: nightCheckSituationTypes.id });

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_situation.create",
        entityType: "night_check_situation_type",
        entityId: row.id,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
  return { ok: true };
}

export async function updateSituationType(
  id: string,
  _prev: SituationTypeFormState,
  formData: FormData,
): Promise<SituationTypeFormState> {
  const staffMember = await assertRole("manager");
  const parsed = situationTypeSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();
  const existing = await db.query.nightCheckSituationTypes.findFirst({
    where: bySite(nightCheckSituationTypes, id, staffMember.siteId),
  });
  if (!existing) return { error: "Situation type not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckSituationTypes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(nightCheckSituationTypes.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_situation.update",
        entityType: "night_check_situation_type",
        entityId: id,
        before: existing,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
  return { ok: true };
}

export async function setSituationTypeActive(id: string, active: boolean) {
  const staffMember = await assertRole("manager");
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.nightCheckSituationTypes.findFirst({
    where: bySite(nightCheckSituationTypes, id, staffMember.siteId),
  });
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckSituationTypes)
      .set({ active, updatedAt: new Date() })
      .where(eq(nightCheckSituationTypes.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: active
          ? "night_check_situation.restore"
          : "night_check_situation.archive",
        entityType: "night_check_situation_type",
        entityId: id,
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
}

/** Swap sort order with the item immediately before/after it (site-scoped, active list). */
export async function moveSituationType(id: string, direction: "up" | "down") {
  const staffMember = await assertRole("manager");
  const db = getDb();

  const items = await db.query.nightCheckSituationTypes.findMany({
    where: and(
      eq(nightCheckSituationTypes.siteId, staffMember.siteId),
      eq(nightCheckSituationTypes.active, true),
    ),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
    columns: { id: true, sortOrder: true },
  });

  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  const a = items[idx];
  const b = items[swapIdx];

  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(nightCheckSituationTypes)
      .set({ sortOrder: b.sortOrder, updatedAt: new Date() })
      .where(eq(nightCheckSituationTypes.id, a.id));
    await tx
      .update(nightCheckSituationTypes)
      .set({ sortOrder: a.sortOrder, updatedAt: new Date() })
      .where(eq(nightCheckSituationTypes.id, b.id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "night_check_situation.reorder",
        entityType: "night_check_situation_type",
        entityId: a.id,
        before: { sortOrder: a.sortOrder },
        after: { sortOrder: b.sortOrder, direction },
      },
      ctx,
    );
  });

  revalidatePath("/night-checks/template");
}
