import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db";
import {
  residents,
  welfareAbsences,
  welfareContacts,
  welfareEscalationActions,
  welfareEscalations,
  type WelfareEscalationActionValue,
  type WelfareMethodValue,
  type WelfareOutcomeValue,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { overdueMinutesAt } from "@/lib/welfare-engine";
import { loadWelfareFacts } from "@/lib/welfare-queries";
import {
  residentName,
  snapshotAt,
  versionAt,
  type ResidentSnapshot,
  type WelfareFacts,
} from "@/lib/welfare-snapshot";
import { ACTION_LABEL } from "@/lib/welfare-policy";
import { METHOD_LABEL, OUTCOME_LABEL } from "@/lib/welfare";

/*
 * Every welfare write runs through here, inside the caller's transaction,
 * after `lockResident` — so two staff acting on the same resident are
 * serialised and each sees what the other just wrote (decision D2).
 */

type AuditCtx = { ip?: string | null; userAgent?: string | null };
type Actor = { id: string; name: string; siteId: string };

const actorOf = (s: Actor) => ({ siteId: s.siteId, actorStaffId: s.id, actorName: s.name });

/**
 * `SELECT … FOR UPDATE` on the resident row: the per-resident mutex for
 * every welfare write. Returns null if the resident isn't at this site.
 */
export async function lockResident(tx: Transaction, siteId: string, residentId: string) {
  const [row] = await tx
    .select({
      id: residents.id,
      firstName: residents.firstName,
      lastName: residents.lastName,
      preferredName: residents.preferredName,
      room: residents.room,
      status: residents.status,
    })
    .from(residents)
    .where(and(eq(residents.id, residentId), eq(residents.siteId, siteId)))
    .for("update");
  return row ?? null;
}

/** Facts and the state as of `at` for one resident, read inside the lock. */
export async function residentSnapshot(
  tx: Transaction,
  siteId: string,
  residentId: string,
  at: Date,
  since: Date,
): Promise<{ facts: WelfareFacts; snap: ResidentSnapshot | null }> {
  const facts = await loadWelfareFacts(siteId, since, { residentId, db: tx });
  return { facts, snap: snapshotAt(facts, at)[0] ?? null };
}

type ResidentRef = { id: string; firstName: string; lastName: string; preferredName: string | null; room: string | null };

function residentPayload(r: ResidentRef) {
  return { id: r.id, name: residentName(r), room: r.room };
}

/**
 * Open an escalation pinned to the rules and due time in force right now.
 * Only call when the snapshot says the resident needs action and none is
 * open; the unique index is the backstop if that's ever wrong.
 */
async function openEscalation(
  tx: Transaction,
  facts: WelfareFacts,
  snap: ResidentSnapshot,
  actor: Actor,
  now: Date,
  ctx: AuditCtx,
): Promise<string> {
  const version = versionAt(facts.versions, now);
  if (!version || !snap.state.tier || !snap.state.dueAt) {
    throw new Error("Cannot open an escalation without published rules and a due time");
  }
  const [row] = await tx
    .insert(welfareEscalations)
    .values({
      siteId: actor.siteId,
      residentId: snap.resident.id,
      policyVersionId: version.id,
      tierKey: snap.state.tier.key,
      dueAt: snap.state.dueAt,
      lastSeenAt: snap.state.lastSeenAt,
      openedAt: now,
      openedByStaffId: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: welfareEscalations.id });
  await writeAudit(
    tx,
    {
      ...actorOf(actor),
      action: "welfare_escalation.open",
      entityType: "welfare_escalation",
      entityId: row.id,
      after: {
        residentId: snap.resident.id,
        rulesVersion: version.version,
        tierKey: snap.state.tier.key,
        dueAt: snap.state.dueAt.toISOString(),
      },
    },
    ctx,
  );
  return row.id;
}

export type LogContactResult = {
  contactId: string;
  closedEscalation: boolean;
  /** A late-logged sighting that still leaves them overdue — the escalation stays open. */
  stillOverdue: boolean;
  openedEscalation: boolean;
  endedAbsence: boolean;
};

/**
 * Log one welfare check. A seen/contacted check that moves the clock
 * forward closes any running escalation — unless, logged late, it still
 * leaves them overdue. "Seen" also ends a planned absence that started
 * before it. A "no response" for someone overdue opens an escalation if
 * none is running.
 *
 * `now` must be read after `lockResident`, so everything committed before
 * the lock is visible to the snapshot (an earlier `now` would hide it).
 */
export async function logContactInTx(
  tx: Transaction,
  input: {
    actor: Actor;
    resident: ResidentRef;
    outcome: WelfareOutcomeValue;
    method: WelfareMethodValue;
    happenedAt: Date;
    note: string | null;
    now: Date;
    ctx: AuditCtx;
  },
): Promise<LogContactResult> {
  const { actor, resident, outcome, method, happenedAt, note, now, ctx } = input;
  const since = new Date(Math.min(happenedAt.getTime(), now.getTime()) - 24 * 3_600_000);
  const { facts, snap } = await residentSnapshot(tx, actor.siteId, resident.id, now, since);
  if (!snap) throw new Error("Resident not found");

  // How late was this check, judged as things stood when it happened?
  const atHappened = snapshotAt(facts, happenedAt)[0];
  const overdueMinutes =
    atHappened && (atHappened.state.kind === "overdue" || atHappened.state.kind === "escalating")
      ? overdueMinutesAt(atHappened.state, happenedAt)
      : null;

  const [contact] = await tx
    .insert(welfareContacts)
    .values({
      siteId: actor.siteId,
      residentId: resident.id,
      outcome,
      method,
      happenedAt,
      staffId: actor.id,
      note,
      overdueMinutes,
      createdAt: now,
    })
    .returning({ id: welfareContacts.id });

  const result: LogContactResult = {
    contactId: contact.id,
    closedEscalation: false,
    stillOverdue: false,
    openedEscalation: false,
    endedAbsence: false,
  };

  const resets = outcome !== "no_response";
  const movesClock =
    resets && (!snap.lastReset || happenedAt.getTime() > snap.lastReset.happenedAt.getTime());

  // Judged on the escalation's own (pinned) interval: "seen at 08:30" logged
  // at 13:40 on a 4-hour tier still leaves them overdue, so it stays open.
  const escTier = snap.escalation?.tier ?? snap.state.tier;
  const stillOverdue =
    !!escTier && now.getTime() >= happenedAt.getTime() + escTier.intervalMinutes * 60_000;
  if (movesClock && snap.escalation && stillOverdue) result.stillOverdue = true;

  if (movesClock && snap.escalation && !stillOverdue) {
    await tx
      .update(welfareEscalations)
      .set({
        resolvedAt: now,
        resolvedByStaffId: actor.id,
        resolvedByContactId: contact.id,
        updatedAt: now,
      })
      .where(eq(welfareEscalations.id, snap.escalation.id));
    await writeAudit(
      tx,
      {
        ...actorOf(actor),
        action: "welfare_escalation.resolve",
        entityType: "welfare_escalation",
        entityId: snap.escalation.id,
        after: { residentId: resident.id, outcome, contactId: contact.id },
      },
      ctx,
    );
    result.closedEscalation = true;
  }

  if (
    outcome === "seen" &&
    snap.absence &&
    snap.absence.startsAt.getTime() <= happenedAt.getTime()
  ) {
    await tx
      .update(welfareAbsences)
      .set({ endedAt: happenedAt, endedByStaffId: actor.id, updatedAt: now })
      .where(eq(welfareAbsences.id, snap.absence.id));
    await writeAudit(
      tx,
      {
        ...actorOf(actor),
        action: "welfare_absence.end",
        entityType: "welfare_absence",
        entityId: snap.absence.id,
        after: { residentId: resident.id, endedAt: happenedAt.toISOString(), contactId: contact.id },
      },
      ctx,
    );
    result.endedAbsence = true;
  }

  if (
    outcome === "no_response" &&
    !snap.escalation &&
    (snap.state.kind === "overdue" || snap.state.kind === "escalating")
  ) {
    await openEscalation(tx, facts, snap, actor, now, ctx);
    result.openedEscalation = true;
  }

  await writeAudit(
    tx,
    {
      ...actorOf(actor),
      action: "welfare_check.log",
      entityType: "welfare_contact",
      entityId: contact.id,
      after: {
        residentId: resident.id,
        outcome,
        method,
        happenedAt: happenedAt.toISOString(),
        overdueMinutes,
        note,
      },
    },
    ctx,
  );

  await enqueueOutbox(tx, {
    siteId: actor.siteId,
    target: "salesforce",
    entityType: "welfare_contact",
    entityId: contact.id,
    payload: {
      recordType: "Welfare",
      kind: "welfare_check",
      resident: residentPayload(resident),
      outcome,
      outcomeLabel: OUTCOME_LABEL[outcome],
      method,
      methodLabel: METHOD_LABEL[method],
      happenedAt: happenedAt.toISOString(),
      loggedAt: now.toISOString(),
      loggedBy: actor.name,
      overdueMinutes,
      note,
    },
  });

  return result;
}

export type RecordActionResult =
  | { ok: true; openedEscalation: boolean }
  | { ok: false; error: string };

/**
 * Record what staff did for an overdue resident. Opens the escalation if
 * this is the first action. `stepId` must be one of the escalation's own
 * steps (or null for "something else"); the action type always comes from
 * the step, never from the form. `rulesBasis` is the rules version the page
 * showed — refused if the steps have changed since. Everything is checked
 * before anything is written, so a refusal leaves no partial escalation.
 */
export async function recordActionInTx(
  tx: Transaction,
  input: {
    actor: Actor;
    resident: ResidentRef;
    facts: WelfareFacts;
    snap: ResidentSnapshot;
    stepId: string | null;
    note: string | null;
    rulesBasis: string;
    happenedAt: Date;
    now: Date;
    ctx: AuditCtx;
  },
): Promise<RecordActionResult> {
  const { actor, resident, facts, snap, stepId, note, rulesBasis, happenedAt, now, ctx } = input;

  if (!snap.escalation && snap.state.kind !== "overdue" && snap.state.kind !== "escalating") {
    return { ok: false, error: `${residentName(resident)} isn't overdue any more. Refresh the board.` };
  }
  if (rulesBasis !== (snap.rulesVersionId ?? "none")) {
    return {
      ok: false,
      error: "The welfare rules changed while you had this open. Nothing was recorded — refresh the board.",
    };
  }

  const tier = snap.escalation?.tier ?? snap.state.tier;
  let action: WelfareEscalationActionValue = "other";
  let instruction: string | null = null;
  if (stepId) {
    const step = tier?.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, error: "That step isn't part of this escalation. Refresh the board." };
    action = step.action;
    instruction = step.instruction;
  } else if (!note) {
    return { ok: false, error: "Say what you did." };
  }

  const escalationId = snap.escalation?.id ?? (await openEscalation(tx, facts, snap, actor, now, ctx));

  const [row] = await tx
    .insert(welfareEscalationActions)
    .values({
      escalationId,
      stepId,
      action,
      note,
      happenedAt,
      staffId: actor.id,
      createdAt: now,
    })
    .returning({ id: welfareEscalationActions.id });

  await tx
    .update(welfareEscalations)
    .set({ updatedAt: now })
    .where(eq(welfareEscalations.id, escalationId));

  await writeAudit(
    tx,
    {
      ...actorOf(actor),
      action: "welfare_escalation.action",
      entityType: "welfare_escalation",
      entityId: escalationId,
      after: { actionId: row.id, residentId: resident.id, stepId, action, note, happenedAt: happenedAt.toISOString() },
    },
    ctx,
  );

  await enqueueOutbox(tx, {
    siteId: actor.siteId,
    target: "salesforce",
    entityType: "welfare_escalation_action",
    entityId: row.id,
    payload: {
      recordType: "Welfare",
      kind: "welfare_escalation_action",
      escalationId,
      resident: residentPayload(resident),
      action,
      actionLabel: ACTION_LABEL[action],
      stepInstruction: instruction,
      dueAt: (snap.escalation?.dueAt ?? snap.state.dueAt)?.toISOString() ?? null,
      lastSeenAt: (snap.escalation?.lastSeenAt ?? snap.state.lastSeenAt)?.toISOString() ?? null,
      happenedAt: happenedAt.toISOString(),
      loggedAt: now.toISOString(),
      loggedBy: actor.name,
      note,
    },
  });

  return { ok: true, openedEscalation: !snap.escalation };
}

/** Does any open absence for the resident overlap [startsAt, expectedBackAt)? */
export async function overlappingAbsence(
  tx: Transaction,
  residentId: string,
  startsAt: Date,
  expectedBackAt: Date,
  excludeId?: string,
) {
  const rows = await tx
    .select({ id: welfareAbsences.id })
    .from(welfareAbsences)
    .where(
      and(
        eq(welfareAbsences.residentId, residentId),
        sql`${welfareAbsences.endedAt} is null`,
        sql`${welfareAbsences.cancelledAt} is null`,
        sql`${welfareAbsences.startsAt} < ${expectedBackAt.toISOString()}::timestamptz`,
        sql`${welfareAbsences.expectedBackAt} > ${startsAt.toISOString()}::timestamptz`,
        excludeId ? sql`${welfareAbsences.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
