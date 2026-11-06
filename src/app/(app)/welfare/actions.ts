"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { welfareAbsences, welfareMethod, welfareOutcome } from "@/db/schema";
import { assertCareStaff } from "@/lib/rbac";
import { auditActor, requestContext, writeAudit } from "@/lib/audit";
import { siteTimeZone } from "@/lib/welfare-queries";
import {
  lockResident,
  logContactInTx,
  overlappingAbsence,
  recordActionInTx,
  residentSnapshot,
} from "@/lib/welfare-write";
import { ORG_GUARDRAILS, formatMinutes } from "@/lib/welfare-policy";
import { needsAction } from "@/lib/welfare-engine";
import { OUTCOME_LABEL, welfareFormatters } from "@/lib/welfare";
import { mostRecentWallTime, parseLocalDateTime } from "@/lib/zoned-time";

export type WelfareActionState = {
  ok?: boolean;
  /** Toast text on success. */
  message?: string;
  error?: string;
  /** Someone else changed this resident since the page loaded (D2). */
  conflict?: string;
};

const HOUR = 3_600_000;
const noteSchema = z.string().trim().max(1000);

function revalidateWelfare(residentId?: string) {
  revalidatePath("/welfare");
  revalidatePath("/");
  if (residentId) revalidatePath(`/residents/${residentId}`);
}

type When = { at: Date | "now" } | { error: string };

/**
 * "Just now", or a typed "HH:MM" read as the most recent time the clock
 * showed it — within the late-logging window. "Just now" is resolved later,
 * inside the transaction, by `resolveWhen`.
 */
function whenFrom(formData: FormData, now: Date, timeZone: string): When {
  if (formData.get("when") !== "earlier") return { at: "now" };
  const at = mostRecentWallTime(String(formData.get("time") ?? ""), now, timeZone);
  if (!at) return { error: "Enter the time it happened." };
  if (now.getTime() - at.getTime() > ORG_GUARDRAILS.lateLogWindowMinutes * 60_000) {
    return {
      error: `You can log something up to ${formatMinutes(ORG_GUARDRAILS.lateLogWindowMinutes)} after it happened. For anything older, add it to the handover.`,
    };
  }
  return { at };
}

/**
 * The moment a write takes effect, read *after* the resident lock so the
 * snapshot sees everything committed before it (decision D2). A typed time
 * is never allowed to be later than that.
 */
function resolveWhen(when: { at: Date | "now" }): { now: Date; happenedAt: Date } {
  const now = new Date();
  if (when.at === "now") return { now, happenedAt: now };
  return { now, happenedAt: when.at.getTime() > now.getTime() ? now : when.at };
}

/* ------------------------------------------------------------------ */
/* Welfare checks                                                       */
/* ------------------------------------------------------------------ */

const checkSchema = z.object({
  outcome: z.enum(welfareOutcome.enumValues),
  method: z.enum(welfareMethod.enumValues),
  note: noteSchema,
});

export async function logWelfareCheck(
  residentId: string,
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const parsed = checkSchema.safeParse({
    outcome: formData.get("outcome"),
    method: formData.get("method"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: "Choose what happened and how." };

  const timeZone = await siteTimeZone(staff.siteId);
  const when = whenFrom(formData, new Date(), timeZone);
  if ("error" in when) return { error: when.error };

  const ctx = await requestContext();
  let result: Awaited<ReturnType<typeof logContactInTx>> | "not_found";
  try {
    result = await getDb().transaction(async (tx) => {
      const resident = await lockResident(tx, staff.siteId, residentId);
      if (!resident || resident.status === "discharged") return "not_found" as const;
      const { now, happenedAt } = resolveWhen(when);
      return logContactInTx(tx, {
        actor: staff,
        resident,
        outcome: parsed.data.outcome,
        method: parsed.data.method,
        happenedAt,
        note: parsed.data.note || null,
        now,
        ctx,
      });
    });
  } catch (err) {
    console.error("logWelfareCheck failed", err);
    return { error: "Could not save the check. Please try again." };
  }
  if (result === "not_found") return { error: "Resident not found." };

  revalidateWelfare(residentId);
  return {
    ok: true,
    message: result.closedEscalation
      ? "Check logged — escalation closed"
      : result.stillOverdue
        ? "Check logged — they're still overdue, so the escalation stays open"
        : result.openedEscalation
          ? "Check logged — escalation started. Follow the steps."
          : result.endedAbsence
            ? "Welcome back logged"
            : "Check logged",
  };
}

/* ------------------------------------------------------------------ */
/* Escalation actions                                                    */
/* ------------------------------------------------------------------ */

export async function recordEscalationAction(
  residentId: string,
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const stepRaw = String(formData.get("step") ?? "");
  const stepId = stepRaw && stepRaw !== "other" ? stepRaw.slice(0, 40) : null;
  if (!stepRaw) return { error: "Choose the step you've done." };
  const note = noteSchema.safeParse(formData.get("note") ?? "");
  if (!note.success) return { error: "Keep the note under 1,000 characters." };
  /** The latest seen/contacted check this page knew about — "none" if never. */
  const basis = String(formData.get("basis") ?? "");
  /** The rules version whose steps the page showed. */
  const rulesBasis = String(formData.get("rulesBasis") ?? "");

  const timeZone = await siteTimeZone(staff.siteId);
  const when = whenFrom(formData, new Date(), timeZone);
  if ("error" in when) return { error: when.error };
  const fmt = welfareFormatters(timeZone);

  const ctx = await requestContext();
  let state: WelfareActionState;
  try {
    state = await getDb().transaction(async (tx) => {
      const resident = await lockResident(tx, staff.siteId, residentId);
      if (!resident) return { error: "Resident not found." };
      const { now, happenedAt } = resolveWhen(when);
      const { facts, snap } = await residentSnapshot(
        tx,
        staff.siteId,
        residentId,
        now,
        new Date(now.getTime() - 24 * HOUR),
      );
      if (!snap) return { error: "Resident not found." };

      // Stale-page check: refuse if they've been seen or contacted since
      // this page loaded and that ended the concern. (A sighting logged late
      // that still leaves them overdue doesn't — the action still matters.)
      const current = snap.lastReset?.id ?? "none";
      if (basis !== current && snap.lastReset && !needsAction(snap.state)) {
        const r = snap.lastReset;
        return {
          conflict: `${snap.name} was logged as ${OUTCOME_LABEL[r.outcome].toLowerCase()} at ${fmt.when(r.happenedAt, now)}${r.staffName ? ` by ${r.staffName}` : ""}. Nothing was recorded. If you've already called anyone about this, let them know ${resident.preferredName ?? resident.firstName} has been found.`,
        };
      }

      const res = await recordActionInTx(tx, {
        actor: staff,
        resident,
        facts,
        snap,
        stepId,
        note: note.data || null,
        rulesBasis,
        happenedAt,
        now,
        ctx,
      });
      if (!res.ok) return { error: res.error };
      return {
        ok: true,
        message: res.openedEscalation ? "Recorded — escalation started" : "Recorded",
      };
    });
  } catch (err) {
    console.error("recordEscalationAction failed", err);
    return { error: "Could not save that. Please try again." };
  }

  if (state.ok) revalidateWelfare(residentId);
  return state;
}

/* ------------------------------------------------------------------ */
/* Planned absences                                                      */
/* ------------------------------------------------------------------ */

const MAX_ABSENCE = 31 * 24 * HOUR;

export async function createAbsence(
  residentId: string,
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const requestNow = new Date();
  const timeZone = await siteTimeZone(staff.siteId);

  // "Leaving now" is resolved inside the lock; a typed start is checked here.
  const startsRaw = String(formData.get("startsAt") ?? "");
  const startsAt = startsRaw ? parseLocalDateTime(startsRaw, timeZone) : requestNow;
  const expectedBackAt = parseLocalDateTime(String(formData.get("expectedBackAt") ?? ""), timeZone);
  const reason = noteSchema.max(300).safeParse(formData.get("reason") ?? "");
  if (!startsAt) return { error: "Enter when they're leaving." };
  if (!expectedBackAt) return { error: "Enter when they're expected back." };
  if (!reason.success) return { error: "Keep the reason under 300 characters." };
  if (expectedBackAt.getTime() <= startsAt.getTime()) {
    return { error: "They need to be expected back after they leave." };
  }
  if (expectedBackAt.getTime() <= requestNow.getTime()) {
    return { error: "The expected back time has already passed." };
  }
  if (requestNow.getTime() - startsAt.getTime() > ORG_GUARDRAILS.lateLogWindowMinutes * 60_000) {
    return {
      error: `An absence can start at most ${formatMinutes(ORG_GUARDRAILS.lateLogWindowMinutes)} ago.`,
    };
  }
  if (expectedBackAt.getTime() - startsAt.getTime() > MAX_ABSENCE) {
    return { error: "A planned absence can be up to 31 days. For longer, set them as on leave." };
  }

  const ctx = await requestContext();
  let state: WelfareActionState;
  try {
    state = await getDb().transaction(async (tx) => {
      const resident = await lockResident(tx, staff.siteId, residentId);
      if (!resident || resident.status === "discharged") return { error: "Resident not found." };
      const now = new Date();
      const startsAtFinal = startsRaw ? startsAt : now;
      const { snap } = await residentSnapshot(tx, staff.siteId, residentId, now, new Date(now.getTime() - 24 * HOUR));
      if (snap?.escalation) {
        return {
          error: `There's an escalation running for ${snap.name}. If you know where they are, log them as contacted first — that closes it.`,
        };
      }
      // An absence must never hide someone who is already overdue.
      if (snap && needsAction(snap.state)) {
        return {
          error: `${snap.name} is overdue for a check. Log them as seen or contacted first, then add the absence.`,
        };
      }
      if (await overlappingAbsence(tx, residentId, startsAtFinal, expectedBackAt)) {
        return { error: "They already have a planned absence over that time. Change that one instead." };
      }
      const [row] = await tx
        .insert(welfareAbsences)
        .values({
          siteId: staff.siteId,
          residentId,
          startsAt: startsAtFinal,
          expectedBackAt,
          reason: reason.data || null,
          createdByStaffId: staff.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: welfareAbsences.id });
      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: "welfare_absence.create",
          entityType: "welfare_absence",
          entityId: row.id,
          after: {
            residentId,
            startsAt: startsAtFinal.toISOString(),
            expectedBackAt: expectedBackAt.toISOString(),
            reason: reason.data || null,
          },
        },
        ctx,
      );
      return { ok: true, message: "Planned absence saved" };
    });
  } catch (err) {
    console.error("createAbsence failed", err);
    return { error: "Could not save the absence. Please try again." };
  }

  if (state.ok) revalidateWelfare(residentId);
  return state;
}

/** Load an absence at the acting staff member's site. */
async function findAbsence(absenceId: string, siteId: string) {
  return getDb().query.welfareAbsences.findFirst({
    where: and(eq(welfareAbsences.id, absenceId), eq(welfareAbsences.siteId, siteId)),
  });
}

export async function changeAbsenceReturn(
  absenceId: string,
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const timeZone = await siteTimeZone(staff.siteId);
  const expectedBackAt = parseLocalDateTime(String(formData.get("expectedBackAt") ?? ""), timeZone);
  if (!expectedBackAt) return { error: "Enter when they're expected back." };
  if (expectedBackAt.getTime() <= Date.now()) {
    return { error: "Choose a time that hasn't passed yet. If they're back, use Back instead." };
  }

  const absence = await findAbsence(absenceId, staff.siteId);
  if (!absence) return { error: "Absence not found." };
  if (absence.endedAt || absence.cancelledAt) return { error: "That absence has already finished." };
  if (expectedBackAt.getTime() - absence.startsAt.getTime() > MAX_ABSENCE) {
    return { error: "A planned absence can be up to 31 days. For longer, set them as on leave." };
  }

  const ctx = await requestContext();
  let state: WelfareActionState;
  try {
    state = await getDb().transaction(async (tx) => {
      await lockResident(tx, staff.siteId, absence.residentId);
      const now = new Date();
      const { snap } = await residentSnapshot(
        tx,
        staff.siteId,
        absence.residentId,
        now,
        new Date(now.getTime() - 24 * HOUR),
      );
      if (snap?.escalation) {
        return {
          error: `There's an escalation running for ${snap.name}. If you've heard from them, log them as contacted first — that closes it.`,
        };
      }
      if (await overlappingAbsence(tx, absence.residentId, absence.startsAt, expectedBackAt, absence.id)) {
        return { error: "That overlaps another planned absence." };
      }
      await tx
        .update(welfareAbsences)
        .set({ expectedBackAt, updatedAt: now })
        .where(eq(welfareAbsences.id, absence.id));
      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: "welfare_absence.change_return",
          entityType: "welfare_absence",
          entityId: absence.id,
          before: { expectedBackAt: absence.expectedBackAt.toISOString() },
          after: { expectedBackAt: expectedBackAt.toISOString() },
        },
        ctx,
      );
      return { ok: true, message: "Return time changed" };
    });
  } catch (err) {
    console.error("changeAbsenceReturn failed", err);
    return { error: "Could not save that. Please try again." };
  }

  if (state.ok) revalidateWelfare(absence.residentId);
  return state;
}

/** They're back: logs them as seen in person now, which ends the absence. */
export async function markAbsenceBack(absenceId: string): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const absence = await findAbsence(absenceId, staff.siteId);
  if (!absence) return { error: "Absence not found." };
  if (absence.endedAt || absence.cancelledAt) return { error: "That absence has already finished." };
  if (absence.startsAt.getTime() > Date.now()) {
    return { error: "This absence hasn't started yet — cancel it instead." };
  }

  const ctx = await requestContext();
  try {
    await getDb().transaction(async (tx) => {
      const resident = await lockResident(tx, staff.siteId, absence.residentId);
      if (!resident) throw new Error("Resident not found");
      const now = new Date();
      await logContactInTx(tx, {
        actor: staff,
        resident,
        outcome: "seen",
        method: "in_person",
        happenedAt: now,
        note: "Back from planned absence",
        now,
        ctx,
      });
    });
  } catch (err) {
    console.error("markAbsenceBack failed", err);
    return { error: "Could not save that. Please try again." };
  }

  revalidateWelfare(absence.residentId);
  return { ok: true, message: "Logged as back and seen" };
}

export async function cancelAbsence(absenceId: string): Promise<WelfareActionState> {
  const staff = await assertCareStaff();
  const absence = await findAbsence(absenceId, staff.siteId);
  if (!absence) return { error: "Absence not found." };
  if (absence.endedAt || absence.cancelledAt) return { error: "That absence has already finished." };

  const ctx = await requestContext();
  const now = await getDb().transaction(async (tx) => {
    await lockResident(tx, staff.siteId, absence.residentId);
    const now = new Date();
    await tx
      .update(welfareAbsences)
      .set({ cancelledAt: now, updatedAt: now })
      .where(eq(welfareAbsences.id, absence.id));
    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "welfare_absence.cancel",
        entityType: "welfare_absence",
        entityId: absence.id,
        after: { residentId: absence.residentId },
      },
      ctx,
    );
    return now;
  });

  revalidateWelfare(absence.residentId);
  return {
    ok: true,
    message:
      absence.startsAt.getTime() <= now.getTime()
        ? "Absence cancelled — their normal checks apply again"
        : "Absence cancelled",
  };
}
