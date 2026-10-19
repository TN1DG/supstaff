import type {
  ResidentStatusValue,
  WelfareEscalationActionValue,
  WelfareMethodValue,
  WelfareOutcomeValue,
} from "@/db/schema";
import {
  computeWelfareState,
  currentAbsence,
  latestReset,
  type WelfareState,
} from "@/lib/welfare-engine";
import type { PolicyTier, WelfarePolicyConfig } from "@/lib/welfare-policy";

/*
 * Every welfare record is timestamped and append-only (or closed with a
 * timestamp), so the state at any moment can be rebuilt from the records:
 * the board asks "as of now", the handover "as of the end of the shift",
 * and the rules preview "as of every 15 minutes over the last day". This
 * module does that rebuild in memory — pure, no database.
 */

export type FactsResident = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  room: string | null;
  status: ResidentStatusValue;
};

export type FactsPlan = {
  residentId: string;
  tierKey: string;
  contactMethods: WelfareMethodValue[];
  howToCheck: string | null;
  residentInvolved: boolean;
  reviewedAt: Date | null;
  startedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type FactsVersion = {
  id: string;
  version: number;
  config: WelfarePolicyConfig;
  changeNote: string;
  reviewDueOn: string;
  publishedAt: Date;
  publishedByName: string | null;
};

export type FactsContact = {
  id: string;
  residentId: string;
  outcome: WelfareOutcomeValue;
  method: WelfareMethodValue;
  happenedAt: Date;
  createdAt: Date;
  note: string | null;
  overdueMinutes: number | null;
  staffName: string | null;
};

export type FactsAbsence = {
  id: string;
  residentId: string;
  startsAt: Date;
  expectedBackAt: Date;
  reason: string | null;
  endedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
};

export type FactsEscalation = {
  id: string;
  residentId: string;
  policyVersionId: string;
  tierKey: string;
  dueAt: Date;
  lastSeenAt: Date | null;
  openedAt: Date;
  openedByName: string | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
};

export type FactsAction = {
  id: string;
  escalationId: string;
  stepId: string | null;
  action: WelfareEscalationActionValue;
  note: string | null;
  happenedAt: Date;
  staffName: string | null;
};

export type WelfareFacts = {
  /** Contacts are complete from here on; earlier ones are summarised in `contactsBefore`. */
  since: Date;
  residents: FactsResident[];
  plans: FactsPlan[];
  /** Newest first. */
  versions: FactsVersion[];
  /** Per resident: their latest reset and latest check of any kind before `since`. */
  contactsBefore: FactsContact[];
  contacts: FactsContact[];
  absences: FactsAbsence[];
  escalations: FactsEscalation[];
  actions: FactsAction[];
};

export type ResidentSnapshot = {
  resident: FactsResident;
  name: string;
  plan: FactsPlan | null;
  state: WelfareState;
  /** The check that set their clock — latest seen/contacted. */
  lastReset: FactsContact | null;
  /** Latest check of any outcome. */
  lastCheck: FactsContact | null;
  absence: FactsAbsence | null;
  upcomingAbsence: FactsAbsence | null;
  escalation:
    | (FactsEscalation & {
        version: FactsVersion | null;
        tier: PolicyTier | null;
        actions: FactsAction[];
        /** Checks logged since it fell due — mostly "no response". */
        contactsSinceDue: FactsContact[];
      })
    | null;
};

export function residentName(r: Pick<FactsResident, "firstName" | "lastName" | "preferredName">) {
  return `${r.preferredName ?? r.firstName} ${r.lastName}`;
}

/** The rules version in force at `at` (latest published at or before it). */
export function versionAt(versions: FactsVersion[], at: Date): FactsVersion | null {
  let best: FactsVersion | null = null;
  for (const v of versions) {
    if (v.publishedAt.getTime() > at.getTime()) continue;
    if (!best || v.version > best.version) best = v;
  }
  return best;
}

const latestBy = <T>(items: T[], at: (x: T) => Date): T | null =>
  items.reduce<T | null>((best, x) => (!best || at(x).getTime() > at(best).getTime() ? x : best), null);

/** Was `t` set on or before `asOf`? Lets a past moment ignore later closes. */
const by = (t: Date | null, asOf: Date) => (t && t.getTime() <= asOf.getTime() ? t : null);

export function snapshotAt(
  facts: WelfareFacts,
  asOf: Date,
  opts: { policyOverride?: WelfarePolicyConfig } = {},
): ResidentSnapshot[] {
  const current = versionAt(facts.versions, asOf);
  const policy = opts.policyOverride ?? current?.config ?? null;
  const versionsById = new Map(facts.versions.map((v) => [v.id, v]));
  const t = asOf.getTime();

  return facts.residents
    .filter((r) => r.status !== "discharged")
    .map((resident) => {
      const plan = facts.plans.find((p) => p.residentId === resident.id) ?? null;
      const planAsOf = plan && plan.createdAt.getTime() <= t ? plan : null;

      const known = [
        ...facts.contactsBefore.filter((c) => c.residentId === resident.id),
        ...facts.contacts.filter((c) => c.residentId === resident.id),
      ].filter((c) => c.happenedAt.getTime() <= t);
      const resetAt = latestReset(known);
      const lastReset =
        resetAt === null
          ? null
          : latestBy(
              known.filter((c) => c.outcome !== "no_response" && c.happenedAt.getTime() === resetAt.getTime()),
              (c) => c.createdAt,
            );
      const lastCheck = latestBy(known, (c) => c.happenedAt);

      const absencesAsOf = facts.absences
        .filter((a) => a.residentId === resident.id)
        .map((a) => ({ ...a, endedAt: by(a.endedAt, asOf), cancelledAt: by(a.cancelledAt, asOf) }));
      const absence = currentAbsence(absencesAsOf, asOf);
      const upcomingAbsence =
        absencesAsOf
          .filter((a) => !a.cancelledAt && !a.endedAt && a.startsAt.getTime() > t)
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;

      const esc =
        facts.escalations.find(
          (e) =>
            e.residentId === resident.id &&
            e.openedAt.getTime() <= t &&
            (!e.resolvedAt || e.resolvedAt.getTime() > t),
        ) ?? null;
      const escVersion = esc ? versionsById.get(esc.policyVersionId) ?? null : null;
      const escTier = escVersion?.config.tiers.find((x) => x.key === esc?.tierKey) ?? null;

      const state = computeWelfareState({
        now: asOf,
        residentOnLeave: resident.status === "on_leave",
        plan: planAsOf ? { tierKey: planAsOf.tierKey, startedAt: planAsOf.startedAt } : null,
        policy,
        lastResetAt: resetAt,
        absences: absencesAsOf,
        openEscalation: esc ? { dueAt: esc.dueAt, lastSeenAt: esc.lastSeenAt, tier: escTier } : null,
      });

      return {
        resident,
        name: residentName(resident),
        plan: planAsOf,
        state,
        lastReset,
        lastCheck,
        absence,
        upcomingAbsence,
        escalation: esc
          ? {
              ...esc,
              version: escVersion,
              tier: escTier,
              actions: facts.actions
                .filter((a) => a.escalationId === esc.id && a.happenedAt.getTime() <= t)
                .sort((a, b) => a.happenedAt.getTime() - b.happenedAt.getTime()),
              contactsSinceDue: known
                .filter((c) => c.happenedAt.getTime() >= esc.dueAt.getTime())
                .sort((a, b) => a.happenedAt.getTime() - b.happenedAt.getTime()),
            }
          : null,
      };
    });
}

export type WelfareCounts = Record<WelfareState["kind"], number>;

export function countByKind(rows: { state: WelfareState }[]): WelfareCounts {
  const counts: WelfareCounts = { escalating: 0, overdue: 0, due_soon: 0, no_plan: 0, ok: 0, away: 0 };
  for (const r of rows) counts[r.state.kind]++;
  return counts;
}

/**
 * How many residents would need action (overdue or escalating) at every
 * `stepMinutes` across the window, under `policy` — the rules editor's
 * "how would this have played out over the last day" preview.
 */
export function needsActionOverWindow(
  facts: WelfareFacts,
  from: Date,
  to: Date,
  policy: WelfarePolicyConfig | undefined,
  stepMinutes = 15,
): { peak: number; peakAt: Date | null; now: WelfareCounts } {
  let peak = 0;
  let peakAt: Date | null = null;
  for (let t = from.getTime(); t <= to.getTime(); t += stepMinutes * 60_000) {
    const at = new Date(t);
    const n = snapshotAt(facts, at, { policyOverride: policy }).filter(
      (r) => r.state.kind === "overdue" || r.state.kind === "escalating",
    ).length;
    if (n > peak) {
      peak = n;
      peakAt = at;
    }
  }
  return { peak, peakAt, now: countByKind(snapshotAt(facts, to, { policyOverride: policy })) };
}
