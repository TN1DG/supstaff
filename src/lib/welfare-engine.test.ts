import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareWelfare,
  computeWelfareState,
  latestReset,
  overdueMinutesAt,
  type EngineInput,
} from "@/lib/welfare-engine";
import type { PolicyTier, WelfarePolicyConfig } from "@/lib/welfare-policy";

const MIN = 60_000;
const t = (iso: string) => new Date(iso);
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);

/** Due-mode tier whose first step is 30 minutes after due, so "overdue" exists on its own. */
const STEPPED: PolicyTier = {
  key: "stepped",
  name: "Stepped",
  intervalMinutes: 180,
  clockStart: "due",
  steps: [
    { id: "a", afterMinutes: 30, action: "retry_contact", instruction: "Knock again" },
    { id: "b", afterMinutes: 60, action: "inform_on_call", instruction: "Call on-call" },
    { id: "c", afterMinutes: 240, action: "report_missing", instruction: "Report missing" },
  ],
};

/** Last-seen tier: steps written as time since last seen. */
const HIGHER: PolicyTier = {
  key: "higher",
  name: "Higher risk",
  intervalMinutes: 240,
  clockStart: "last_seen",
  steps: [
    { id: "h1", afterMinutes: 240, action: "retry_contact", instruction: "Knock" },
    { id: "h2", afterMinutes: 300, action: "inform_on_call", instruction: "On-call" },
    { id: "h3", afterMinutes: 480, action: "report_missing", instruction: "Missing" },
  ],
};

const POLICY: WelfarePolicyConfig = { tiers: [STEPPED, HIGHER] };

const SEEN = t("2026-10-19T20:00:00Z");

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: plus(SEEN, 10),
    residentOnLeave: false,
    plan: { tierKey: "stepped", startedAt: t("2026-10-01T09:00:00Z") },
    policy: POLICY,
    lastResetAt: SEEN,
    absences: [],
    openEscalation: null,
    ...over,
  };
}

describe("why a resident has no status", () => {
  it("no published rules", () => {
    const s = computeWelfareState(input({ policy: null }));
    assert.equal(s.kind, "no_plan");
    assert.equal(s.reason, "no_rules");
  });

  it("no plan", () => {
    const s = computeWelfareState(input({ plan: null }));
    assert.equal(s.kind, "no_plan");
    assert.equal(s.reason, "no_plan");
  });

  it("plan on a tier that is no longer in the rules", () => {
    const s = computeWelfareState(input({ plan: { tierKey: "gone", startedAt: SEEN } }));
    assert.equal(s.kind, "no_plan");
    assert.equal(s.reason, "tier_missing");
  });

  it("resident on leave is away whatever their plan says", () => {
    const s = computeWelfareState(input({ residentOnLeave: true, now: plus(SEEN, 10_000) }));
    assert.equal(s.kind, "away");
    assert.equal(s.reason, "on_leave");
  });
});

describe("due time", () => {
  it("counts from the last seen or contacted check", () => {
    const s = computeWelfareState(input());
    assert.equal(s.kind, "ok");
    assert.deepEqual(s.dueAt, plus(SEEN, 180));
  });

  it("counts from the plan start when nothing has been logged yet", () => {
    const startedAt = t("2026-10-19T18:00:00Z");
    const s = computeWelfareState(
      input({ lastResetAt: null, plan: { tierKey: "stepped", startedAt }, now: plus(startedAt, 1) }),
    );
    assert.deepEqual(s.dueAt, plus(startedAt, 180));
    assert.equal(s.lastSeenAt, null);
  });
});

describe("boundaries around the due time (boundary value analysis)", () => {
  const due = plus(SEEN, 180);
  const at = (now: Date) => computeWelfareState(input({ now })).kind;

  it("61 minutes before due is OK", () => assert.equal(at(plus(due, -61)), "ok"));
  it("exactly 60 minutes before due is due soon", () => assert.equal(at(plus(due, -60)), "due_soon"));
  it("1 ms before due is still due soon", () => assert.equal(at(new Date(due.getTime() - 1)), "due_soon"));
  it("exactly at the due time is overdue", () => assert.equal(at(due), "overdue"));
  it("1 ms before the first step is still overdue", () =>
    assert.equal(at(new Date(plus(due, 30).getTime() - 1)), "overdue"));
  it("exactly at the first step's time is escalating", () => assert.equal(at(plus(due, 30)), "escalating"));
});

describe("escalation steps (state transitions)", () => {
  const due = plus(SEEN, 180);

  it("current step is the latest whose time has passed; next is the one after", () => {
    const s = computeWelfareState(input({ now: plus(due, 61) }));
    assert.equal(s.kind, "escalating");
    assert.equal(s.currentStepIndex, 1);
    assert.equal(s.steps[1].id, "b");
    assert.deepEqual(s.nextStepAt, plus(due, 240));
    assert.deepEqual(
      s.steps.map((x) => x.reached),
      [true, true, false],
    );
  });

  it("once every step has passed it stays on the last one", () => {
    const s = computeWelfareState(input({ now: plus(due, 10_000) }));
    assert.equal(s.currentStepIndex, 2);
    assert.equal(s.nextStepAt, null);
  });

  it("a fresh seen check takes them back to OK", () => {
    const later = plus(due, 90);
    const s = computeWelfareState(input({ now: plus(later, 1), lastResetAt: later }));
    assert.equal(s.kind, "ok");
    assert.deepEqual(s.dueAt, plus(later, 180));
  });

  it("a last-seen tier with its first step at the interval escalates the moment it's due", () => {
    const s = computeWelfareState(
      input({ plan: { tierKey: "higher", startedAt: SEEN }, now: plus(SEEN, 240) }),
    );
    assert.equal(s.kind, "escalating");
    assert.equal(s.currentStepIndex, 0);
  });
});

describe("the two ways of writing step times describe the same moment", () => {
  it("5 hours since last seen on a 4-hour tier = 1 hour after due", () => {
    const asDue: PolicyTier = {
      ...HIGHER,
      key: "higher-due",
      clockStart: "due",
      steps: HIGHER.steps.map((s) => ({ ...s, afterMinutes: s.afterMinutes - 240 })),
    };
    const now = plus(SEEN, 301);
    const a = computeWelfareState(
      input({ plan: { tierKey: "higher", startedAt: SEEN }, now }),
    );
    const b = computeWelfareState(
      input({
        plan: { tierKey: "higher-due", startedAt: SEEN },
        policy: { tiers: [HIGHER, asDue] },
        now,
      }),
    );
    assert.deepEqual(
      a.steps.map((s) => s.at.getTime()),
      b.steps.map((s) => s.at.getTime()),
    );
    assert.deepEqual(a.steps[1].at, plus(SEEN, 300));
  });
});

describe("which checks reset the clock (equivalence classes + ordering)", () => {
  it("seen and contacted count; no response doesn't", () => {
    const r = latestReset([
      { outcome: "seen", happenedAt: t("2026-10-19T20:00:00Z") },
      { outcome: "no_response", happenedAt: t("2026-10-19T23:00:00Z") },
      { outcome: "contacted", happenedAt: t("2026-10-19T21:00:00Z") },
    ]);
    assert.deepEqual(r, t("2026-10-19T21:00:00Z"));
  });

  it("a check logged late with an earlier time never moves the clock backwards", () => {
    // Logged in this order: 03:00 first, then someone adds a 01:00 sighting.
    const r = latestReset([
      { outcome: "seen", happenedAt: t("2026-10-20T03:00:00Z") },
      { outcome: "seen", happenedAt: t("2026-10-20T01:00:00Z") },
    ]);
    assert.deepEqual(r, t("2026-10-20T03:00:00Z"));
  });

  it("nothing logged, or only no responses, means never seen", () => {
    assert.equal(latestReset([]), null);
    assert.equal(latestReset([{ outcome: "no_response", happenedAt: SEEN }]), null);
  });
});

describe("planned absences", () => {
  const leaves = t("2026-10-19T17:00:00Z");
  const back = t("2026-10-19T21:00:00Z");
  const absence = { startsAt: leaves, expectedBackAt: back, endedAt: null, cancelledAt: null };

  it("an absence in progress pauses the clock", () => {
    const s = computeWelfareState(
      input({ lastResetAt: plus(leaves, -10), absences: [absence], now: plus(back, -1) }),
    );
    assert.equal(s.kind, "away");
    assert.equal(s.reason, "absence");
    assert.deepEqual(s.awayUntil, back);
  });

  it("not back by the expected time: due then, even if the normal interval hasn't passed", () => {
    const s = computeWelfareState(
      input({ lastResetAt: plus(leaves, -10), absences: [absence], now: back }),
    );
    assert.equal(s.kind, "overdue");
    assert.deepEqual(s.dueAt, back);
    assert.equal(s.dueFromAbsence, true);
  });

  it("steps after a missed return count from the expected back time", () => {
    const s = computeWelfareState(
      input({ lastResetAt: plus(leaves, -10), absences: [absence], now: plus(back, 61) }),
    );
    assert.equal(s.kind, "escalating");
    assert.deepEqual(s.steps[1].at, plus(back, 60));
  });

  it("contact after the expected back time restarts the normal clock", () => {
    const phoned = plus(back, 20);
    const s = computeWelfareState(
      input({ lastResetAt: phoned, absences: [absence], now: plus(phoned, 1) }),
    );
    assert.equal(s.kind, "ok");
    assert.deepEqual(s.dueAt, plus(phoned, 180));
  });

  it("future, cancelled and ended absences are ignored", () => {
    const future = { ...absence, startsAt: plus(SEEN, 60), expectedBackAt: plus(SEEN, 600) };
    const cancelled = { ...absence, startsAt: SEEN, cancelledAt: SEEN };
    const ended = { ...absence, startsAt: SEEN, endedAt: plus(SEEN, 5) };
    const s = computeWelfareState(input({ absences: [future, cancelled, ended] }));
    assert.equal(s.kind, "ok");
    assert.deepEqual(s.dueAt, plus(SEEN, 180));
  });
});

describe("a running escalation keeps the rules it was opened under", () => {
  it("a publish that loosens the rules doesn't change it", () => {
    const pinnedDue = plus(SEEN, 180);
    const loosened: WelfarePolicyConfig = {
      tiers: [{ ...STEPPED, intervalMinutes: 1440 }],
    };
    const s = computeWelfareState(
      input({
        policy: loosened,
        now: plus(pinnedDue, 61),
        openEscalation: { dueAt: pinnedDue, lastSeenAt: SEEN, tier: STEPPED },
      }),
    );
    assert.equal(s.pinned, true);
    assert.deepEqual(s.dueAt, pinnedDue);
    assert.equal(s.kind, "escalating");
    assert.equal(s.currentStepIndex, 1);
  });

  it("an escalation whose tier can't be loaded falls back to the current rules", () => {
    const s = computeWelfareState(
      input({ openEscalation: { dueAt: SEEN, lastSeenAt: SEEN, tier: null } }),
    );
    assert.equal(s.pinned, false);
    assert.deepEqual(s.dueAt, plus(SEEN, 180));
  });
});

describe("clock change (clocks go back 02:00 BST → 01:00 GMT on 25 Oct 2026)", () => {
  it("an 8-hour interval across the change is 8 real hours, not 8 on the wall clock", () => {
    const eight: PolicyTier = { ...STEPPED, key: "eight", intervalMinutes: 480 };
    // Seen 00:30 BST (23:30Z). 8 real hours later is 07:30Z = 07:30 GMT,
    // which the wall clock shows as only 7 hours after 00:30.
    const seen = t("2026-10-24T23:30:00Z");
    const s = computeWelfareState(
      input({
        policy: { tiers: [eight] },
        plan: { tierKey: "eight", startedAt: seen },
        lastResetAt: seen,
        now: plus(seen, 1),
      }),
    );
    assert.deepEqual(s.dueAt, t("2026-10-25T07:30:00Z"));
    assert.equal((s.dueAt!.getTime() - seen.getTime()) / MIN, 480);
  });
});

describe("overdue minutes when a check is logged", () => {
  it("is null before due and counts whole minutes after", () => {
    const s = computeWelfareState(input({ now: plus(SEEN, 200) }));
    assert.equal(overdueMinutesAt(s, plus(SEEN, 170)), null);
    assert.equal(overdueMinutesAt(s, plus(SEEN, 180)), 0);
    assert.equal(overdueMinutesAt(s, plus(SEEN, 225.5)), 45);
  });
});

describe("board order", () => {
  it("most urgent first; two residents on leave compare equal, not NaN", () => {
    const due = plus(SEEN, 180);
    const states = [
      computeWelfareState(input({ now: plus(SEEN, 10) })), // ok
      computeWelfareState(input({ residentOnLeave: true })), // away
      computeWelfareState(input({ now: plus(due, 241) })), // escalating, step 3
      computeWelfareState(input({ plan: null })), // no plan
      computeWelfareState(input({ now: plus(due, 5) })), // overdue
      computeWelfareState(input({ now: plus(due, 31) })), // escalating, step 1
      computeWelfareState(input({ now: plus(due, -30) })), // due soon
    ];
    const order = [...states].sort(compareWelfare).map((s) => `${s.kind}:${s.currentStepIndex ?? "-"}`);
    assert.deepEqual(order, [
      "escalating:2",
      "escalating:0",
      "overdue:-",
      "due_soon:-",
      "no_plan:-",
      "ok:-",
      "away:-",
    ]);
    const away = computeWelfareState(input({ residentOnLeave: true }));
    assert.equal(compareWelfare(away, away), 0);
  });
});
