"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  checklistResultStatus,
  nightCheckRounds,
  shiftChecklistResults,
  wakingNightShifts,
} from "@/db/schema";
import { assertCareStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { pinCheck } from "@/lib/pin";
import { bySite } from "@/lib/db-scope";
import { firstIssue } from "@/lib/forms";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf } from "@/lib/site-time";
import { CHECKLIST_ITEM_BY_KEY, validateResolution } from "@/lib/waking-night/checklist";
import { ensureScheduledRounds } from "@/lib/waking-night/round-store";
import { loadShiftView, type ShiftView } from "@/lib/waking-night/shift-view";
import { appendHandoverNote } from "@/lib/handover-sync";

function revalidateShift() {
  revalidatePath("/waking-night");
  revalidatePath("/night-checks");
  revalidatePath("/");
}

/**
 * Start tonight's waking-night shift: the shift header plus a `scheduled` row
 * for every welfare round on the service's schedule. Safe to press twice —
 * both the shift and the rounds are unique per night.
 */
export async function startShift() {
  const staffMember = await assertCareStaff();
  const now = new Date();
  const config = await getSiteConfig(staffMember.siteId);
  const night = nightOf(now, config.timezone);
  const db = getDb();
  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    const [shift] = await tx
      .insert(wakingNightShifts)
      .values({
        siteId: staffMember.siteId,
        shiftDate: night,
        startedByStaffId: staffMember.id,
        startedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: wakingNightShifts.id });
    const rounds = await ensureScheduledRounds(tx, staffMember.siteId, night, config);
    if (!shift) return; // someone else started it first

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "waking_night.start",
        entityType: "waking_night_shift",
        entityId: shift.id,
        after: { shiftDate: night, roundsScheduled: rounds, roundTimes: config.roundTimes },
      },
      ctx,
    );
  });

  revalidateShift();
}

const resolveSchema = z.object({
  status: z.enum(checklistResultStatus.enumValues),
  reason: z.string().trim().max(500).optional(),
});

export type ResolveItemState = { error?: string; ok?: boolean };

/** Record (or change) a staff answer for one checklist item. */
export async function resolveChecklistItem(
  shiftId: string,
  itemKey: string,
  _prev: ResolveItemState,
  formData: FormData,
): Promise<ResolveItemState> {
  const staffMember = await assertCareStaff();
  const def = CHECKLIST_ITEM_BY_KEY.get(itemKey);
  if (!def) return { error: "Unknown checklist item." };

  const parsed = resolveSchema.safeParse({
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const invalid = validateResolution(def, parsed.data.status, parsed.data.reason);
  if (invalid) return { error: invalid };

  const db = getDb();
  const ctx = await requestContext();
  const shift = await db.query.wakingNightShifts.findFirst({
    where: bySite(wakingNightShifts, shiftId, staffMember.siteId),
    columns: { id: true, status: true },
  });
  if (!shift) return { error: "Shift not found." };
  if (shift.status !== "open") return { error: "This shift has been signed off." };

  const now = new Date();
  const values = {
    status: parsed.data.status,
    source: "manual" as const,
    reason: parsed.data.reason || null,
    resolvedByStaffId: staffMember.id,
    resolvedAt: now,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(shiftChecklistResults)
      .values({ shiftId, itemKey, ...values })
      .onConflictDoUpdate({
        target: [shiftChecklistResults.shiftId, shiftChecklistResults.itemKey],
        set: values,
      });
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "waking_night.checklist_item",
        entityType: "waking_night_shift",
        entityId: shiftId,
        after: { itemKey, status: values.status, reason: values.reason },
      },
      ctx,
    );
  });

  revalidateShift();
  return { ok: true };
}

const FOLLOW_UP_WORDS = { open: "open", done: "done", not_done: "not done", na: "N/A" } as const;

/** One handover-ready paragraph: rounds, anything not done, and who signed off. */
function checklistSummary(view: ShiftView, signedOffBy: string, now: Date): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: view.config.timezone,
  }).format(now);
  const count = (t: string) => view.rounds.filter((r) => r.timeliness === t).length;
  const roundNotes = view.rounds
    .filter((r) => r.timeliness && r.timeliness !== "on_time")
    .map((r) => `${r.roundTime} ${r.timeliness}: ${r.row?.timelinessReason ?? "—"}`);
  const notDone = view.items
    .filter((i) => i.status !== "done")
    .map((i) => `${i.label} — ${i.status === "na" ? "N/A" : "not done"}${i.reason ? `: ${i.reason}` : ""}`);
  return [
    `[Waking night signed off · ${time} by ${signedOffBy}]`,
    `Welfare rounds: ${count("on_time")} on time, ${count("late")} late, ${count("missed")} missed.`,
    ...roundNotes,
    ...view.events.map(
      (e) =>
        `${e.label}: ${e.followUps
          .map((f) => `${f.label} — ${FOLLOW_UP_WORDS[f.status]}${f.choice ? ` (${f.choice})` : ""}${f.reason ? `: ${f.reason}` : ""}`)
          .join("; ")}`,
    ),
    notDone.length ? `Checklist exceptions: ${notDone.join("; ")}.` : "Checklist: every item done.",
  ].join("\n");
}

export type SignOffState = { error?: string; blockers?: string[]; ok?: boolean };

/**
 * Sign the shift off. Everything is re-checked here, server-side — the page's
 * blocker list is only a preview. On success, missed rounds go on record and
 * every item's answer is snapshotted.
 */
export async function signOffShift(
  shiftId: string,
  _prev: SignOffState,
  formData: FormData,
): Promise<SignOffState> {
  const staffMember = await assertCareStaff();
  const pin = String(formData.get("pin") ?? "");
  const db = getDb();
  const ctx = await requestContext();

  const shift = await db.query.wakingNightShifts.findFirst({
    where: bySite(wakingNightShifts, shiftId, staffMember.siteId),
    columns: { id: true, status: true, shiftDate: true },
  });
  if (!shift) return { error: "Shift not found." };
  if (shift.status !== "open") return { error: "This shift has already been signed off." };

  const view = await loadShiftView(staffMember.siteId, { night: shift.shiftDate });
  if (view.blockers.length > 0) {
    return { error: "This shift can't be signed off yet.", blockers: view.blockers };
  }

  const pinError = await pinCheck(staffMember.id, pin);
  if (pinError) return { error: pinError };

  const now = new Date();
  const signed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(wakingNightShifts)
      .set({
        status: "signed_off",
        signedOffAt: now,
        signedOffByStaffId: staffMember.id,
        updatedAt: now,
      })
      .where(and(eq(wakingNightShifts.id, shiftId), eq(wakingNightShifts.status, "open")))
      .returning({ id: wakingNightShifts.id });
    if (!row) return false;

    // Rounds whose verdict was only computed live go on record now.
    for (const r of view.rounds) {
      if (!r.row || !r.timeliness || r.row.timeliness === r.timeliness) continue;
      await tx
        .update(nightCheckRounds)
        .set({
          timeliness: r.timeliness,
          ...(r.row.status === "scheduled" ? { status: "missed" as const } : {}),
          updatedAt: now,
        })
        .where(eq(nightCheckRounds.id, r.row.id));
    }

    // Snapshot auto-completed items so the record survives later data changes.
    for (const item of view.items) {
      if (item.resolvedBy !== "auto" || !item.status) continue;
      const outcome = view.auto[item.key];
      const values = {
        status: item.status,
        source: "auto" as const,
        // Keep the evidence text as the reason so the record reads on its own.
        reason: outcome?.evidence.map((e) => e.label).join("; ") || null,
        sourceEntityType: outcome?.sourceEntityType ?? null,
        sourceEntityId: outcome?.sourceEntityId ?? null,
        resolvedByStaffId: null,
        resolvedAt: now,
      };
      await tx
        .insert(shiftChecklistResults)
        .values({ shiftId, itemKey: item.key, ...values })
        .onConflictDoUpdate({
          target: [shiftChecklistResults.shiftId, shiftChecklistResults.itemKey],
          set: values,
        });
    }

    // The completed checklist feeds the AM handover.
    await appendHandoverNote(tx, {
      siteId: staffMember.siteId,
      handoverDate: shift.shiftDate,
      shift: "night",
      residentId: null,
      line: checklistSummary(view, staffMember.name, now),
      incidentFlag: false,
      staff: { id: staffMember.id, name: staffMember.name },
      ctx,
      auditAfter: { wakingNightShiftId: shiftId },
    });

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "waking_night.sign_off",
        entityType: "waking_night_shift",
        entityId: shiftId,
        after: {
          shiftDate: shift.shiftDate,
          items: view.items.map((i) => ({ key: i.key, status: i.status, by: i.resolvedBy })),
          rounds: view.rounds.map((r) => ({ time: r.roundTime, timeliness: r.timeliness })),
        },
      },
      ctx,
    );
    return true;
  });
  if (!signed) return { error: "This shift has already been signed off." };

  revalidateShift();
  return { ok: true };
}
