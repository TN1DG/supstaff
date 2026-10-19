import {
  ORG_GUARDRAILS,
  minutesAfterDue,
  sortedSteps,
  type EscalationAction,
  type PolicyTier,
  type WelfarePolicyConfig,
} from "@/lib/welfare-policy";

/*
 * The welfare status engine — a pure function from a resident's facts and
 * the time to their status. Nothing it returns is stored: the board, the
 * resident page and the handover call it on every read, so a status can
 * never be stale (decision D1 in the spec). Client-safe.
 */

export type WelfareKind = "escalating" | "overdue" | "due_soon" | "no_plan" | "ok" | "away";

export type WelfareReason = "no_plan" | "no_rules" | "tier_missing" | "on_leave" | "absence";

export type EngineAbsence = {
  startsAt: Date;
  expectedBackAt: Date;
  endedAt: Date | null;
  cancelledAt: Date | null;
};

export type EngineInput = {
  now: Date;
  /** `residents.status = 'on_leave'` — not in the house, no checks due. */
  residentOnLeave: boolean;
  plan: { tierKey: string; startedAt: Date } | null;
  /** The site's current published rules, or null if none yet. */
  policy: WelfarePolicyConfig | null;
  /** The latest `happenedAt` of a seen/contacted check. */
  lastResetAt: Date | null;
  absences: EngineAbsence[];
  /**
   * An escalation already running: its due time and tier are pinned to the
   * rules in force when it was opened, whatever has been published since.
   */
  openEscalation: { dueAt: Date; lastSeenAt: Date | null; tier: PolicyTier | null } | null;
};

export type StepTiming = {
  id: string;
  action: EscalationAction;
  instruction: string;
  minutesAfterDue: number;
  at: Date;
  reached: boolean;
};

export type WelfareState = {
  kind: WelfareKind;
  reason: WelfareReason | null;
  tier: PolicyTier | null;
  dueAt: Date | null;
  lastSeenAt: Date | null;
  /** Set while away on a planned absence. */
  awayUntil: Date | null;
  /** Due because they weren't back by an absence's expected time. */
  dueFromAbsence: boolean;
  steps: StepTiming[];
  /** Index into `steps` of the latest step whose time has passed. */
  currentStepIndex: number | null;
  nextStepAt: Date | null;
  /** True when the steps come from a running escalation's pinned rules. */
  pinned: boolean;
};

const MINUTE = 60_000;

function blank(kind: WelfareKind, reason: WelfareReason | null, lastSeenAt: Date | null): WelfareState {
  return {
    kind,
    reason,
    tier: null,
    dueAt: null,
    lastSeenAt,
    awayUntil: null,
    dueFromAbsence: false,
    steps: [],
    currentStepIndex: null,
    nextStepAt: null,
    pinned: false,
  };
}

/** The absence in progress at `now`, if any (latest start wins). */
export function currentAbsence<T extends EngineAbsence>(absences: T[], now: Date): T | null {
  let best: T | null = null;
  for (const a of absences) {
    if (a.cancelledAt || a.endedAt) continue;
    if (a.startsAt.getTime() > now.getTime()) continue;
    if (!best || a.startsAt.getTime() > best.startsAt.getTime()) best = a;
  }
  return best;
}

function fromDue(
  now: Date,
  tier: PolicyTier,
  dueAt: Date,
  lastSeenAt: Date | null,
  extra: { pinned: boolean; dueFromAbsence: boolean },
): WelfareState {
  const t = now.getTime();
  const due = dueAt.getTime();
  const base = {
    ...blank("ok", null, lastSeenAt),
    tier,
    dueAt,
    pinned: extra.pinned,
    dueFromAbsence: extra.dueFromAbsence,
  };

  if (t < due - ORG_GUARDRAILS.dueSoonMinutes * MINUTE) return base;
  if (t < due) return { ...base, kind: "due_soon" };

  const steps: StepTiming[] = sortedSteps(tier).map((s) => {
    const after = minutesAfterDue(tier, s);
    const at = new Date(due + after * MINUTE);
    return {
      id: s.id,
      action: s.action,
      instruction: s.instruction,
      minutesAfterDue: after,
      at,
      reached: t >= at.getTime(),
    };
  });
  let current: number | null = null;
  steps.forEach((s, i) => {
    if (s.reached) current = i;
  });
  const next = steps.find((s) => !s.reached) ?? null;

  return {
    ...base,
    kind: current === null ? "overdue" : "escalating",
    steps,
    currentStepIndex: current,
    nextStepAt: next?.at ?? null,
  };
}

export function computeWelfareState(input: EngineInput): WelfareState {
  const { now, plan, policy, lastResetAt } = input;

  if (input.residentOnLeave) return blank("away", "on_leave", lastResetAt);

  // A running escalation stays on the rules it was opened under. It closes
  // when someone logs the resident as seen or contacted.
  const esc = input.openEscalation;
  if (esc?.tier) {
    return fromDue(now, esc.tier, esc.dueAt, esc.lastSeenAt ?? lastResetAt, {
      pinned: true,
      dueFromAbsence: false,
    });
  }

  if (!policy) return blank("no_plan", "no_rules", lastResetAt);
  if (!plan) return blank("no_plan", "no_plan", lastResetAt);
  const tier = policy.tiers.find((t) => t.key === plan.tierKey) ?? null;
  if (!tier) return blank("no_plan", "tier_missing", lastResetAt);

  const interval = tier.intervalMinutes * MINUTE;
  const from = lastResetAt ?? plan.startedAt;
  const normalDue = new Date(from.getTime() + interval);
  const absence = currentAbsence(input.absences, now);

  // An absence only pauses the clock if they weren't already due when it
  // started. Someone overdue before they were meant to leave hasn't been
  // seen leaving, so they must not drop off "Needs action".
  if (absence && absence.startsAt.getTime() < normalDue.getTime()) {
    if (now.getTime() < absence.expectedBackAt.getTime()) {
      return { ...blank("away", "absence", lastResetAt), tier, awayUntil: absence.expectedBackAt };
    }
    // Not back by the expected time: the check falls due then — unless
    // they've been seen or contacted since, which restarts the clock.
    if (lastResetAt && lastResetAt.getTime() >= absence.expectedBackAt.getTime()) {
      return fromDue(now, tier, new Date(lastResetAt.getTime() + interval), lastResetAt, {
        pinned: false,
        dueFromAbsence: false,
      });
    }
    return fromDue(now, tier, absence.expectedBackAt, lastResetAt, {
      pinned: false,
      dueFromAbsence: true,
    });
  }

  return fromDue(now, tier, normalDue, lastResetAt, { pinned: false, dueFromAbsence: false });
}

/**
 * When the resident was last seen or contacted: the latest `happenedAt`
 * among those checks, regardless of the order they were logged in. A
 * "no response" never counts, and a check logged late with an earlier time
 * never moves the clock backwards.
 */
export function latestReset(
  contacts: { outcome: "seen" | "contacted" | "no_response"; happenedAt: Date }[],
): Date | null {
  let latest: Date | null = null;
  for (const c of contacts) {
    if (c.outcome === "no_response") continue;
    if (!latest || c.happenedAt.getTime() > latest.getTime()) latest = c.happenedAt;
  }
  return latest;
}

/** Minutes past due at `at`, or null if not overdue then. */
export function overdueMinutesAt(state: WelfareState, at: Date): number | null {
  if (!state.dueAt) return null;
  const diff = at.getTime() - state.dueAt.getTime();
  return diff >= 0 ? Math.floor(diff / MINUTE) : null;
}

export function needsAction(state: WelfareState): boolean {
  return state.kind === "overdue" || state.kind === "escalating";
}

/** How serious a step is, for ordering residents who are escalating on different tiers. */
const STEP_SEVERITY: Record<EscalationAction, number> = {
  report_missing: 3,
  inform_on_call: 2,
  inform_manager: 2,
  retry_contact: 1,
  other: 1,
};

/** The most serious step whose time has passed (0 if none). */
export function escalationSeverity(state: WelfareState): number {
  return state.steps.reduce((max, s) => (s.reached ? Math.max(max, STEP_SEVERITY[s.action]) : max), 0);
}

const RANK: Record<WelfareKind, number> = {
  escalating: 0,
  overdue: 1,
  due_soon: 2,
  no_plan: 3,
  ok: 4,
  away: 5,
};

/**
 * Most urgent first: by the most serious step reached (report missing,
 * then on-call or manager, then retry — compared by what the step is, not
 * its position, since tiers have different numbers of steps), then longest
 * overdue, then soonest due.
 */
export function compareWelfare(a: WelfareState, b: WelfareState): number {
  if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind];
  if (a.kind === "escalating" && b.kind === "escalating") {
    const severity = escalationSeverity(b) - escalationSeverity(a);
    if (severity !== 0) return severity;
  }
  // MAX_SAFE_INTEGER, not Infinity: Infinity − Infinity is NaN, which breaks sort.
  const last = Number.MAX_SAFE_INTEGER;
  if (a.kind === "away") {
    return (a.awayUntil?.getTime() ?? last) - (b.awayUntil?.getTime() ?? last);
  }
  return (a.dueAt?.getTime() ?? last) - (b.dueAt?.getTime() ?? last);
}
