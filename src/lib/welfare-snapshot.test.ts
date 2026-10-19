import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { needsActionOverWindow, snapshotAt, versionAt, type WelfareFacts } from "@/lib/welfare-snapshot";
import type { WelfarePolicyConfig } from "@/lib/welfare-policy";

const MIN = 60_000;
const t = (iso: string) => new Date(iso);
const plus = (d: Date, m: number) => new Date(d.getTime() + m * MIN);

const V1: WelfarePolicyConfig = {
  tiers: [
    {
      key: "std",
      name: "Standard",
      intervalMinutes: 180,
      clockStart: "due",
      steps: [
        { id: "a", afterMinutes: 0, action: "retry_contact", instruction: "Knock" },
        { id: "b", afterMinutes: 60, action: "inform_on_call", instruction: "On-call" },
        { id: "c", afterMinutes: 240, action: "report_missing", instruction: "Missing" },
      ],
    },
  ],
};
const V2: WelfarePolicyConfig = { tiers: [{ ...V1.tiers[0], intervalMinutes: 600 }] };

const SEEN = t("2026-10-19T18:00:00Z");
const DUE = plus(SEEN, 180);

function facts(over: Partial<WelfareFacts> = {}): WelfareFacts {
  return {
    since: t("2026-10-19T00:00:00Z"),
    residents: [{ id: "r1", firstName: "Aisha", lastName: "Bello", preferredName: null, room: "1", status: "active" }],
    plans: [
      {
        residentId: "r1",
        tierKey: "std",
        contactMethods: ["in_person"],
        howToCheck: null,
        residentInvolved: true,
        reviewedAt: null,
        startedAt: t("2026-10-01T00:00:00Z"),
        createdAt: t("2026-10-01T00:00:00Z"),
        updatedAt: t("2026-10-01T00:00:00Z"),
      },
    ],
    versions: [
      { id: "v2", version: 2, config: V2, changeNote: "", reviewDueOn: "2027-10-01", publishedAt: plus(DUE, 30), publishedByName: null },
      { id: "v1", version: 1, config: V1, changeNote: "", reviewDueOn: "2027-10-01", publishedAt: t("2026-10-01T00:00:00Z"), publishedByName: null },
    ],
    contactsBefore: [],
    contacts: [
      {
        id: "c1",
        residentId: "r1",
        outcome: "seen",
        method: "in_person",
        happenedAt: SEEN,
        createdAt: SEEN,
        note: null,
        overdueMinutes: null,
        staffName: "Sam",
      },
    ],
    absences: [],
    escalations: [],
    actions: [],
    ...over,
  };
}

describe("rebuilding state at a past moment", () => {
  it("uses the rules in force at that moment", () => {
    const f = facts();
    assert.equal(versionAt(f.versions, plus(DUE, 10))?.version, 1);
    assert.equal(versionAt(f.versions, plus(DUE, 31))?.version, 2);
    assert.equal(versionAt(f.versions, t("2026-09-01T00:00:00Z")), null);
    // Before v2: overdue under v1 (3h). After v2: a 10h interval, so OK again.
    assert.equal(snapshotAt(f, plus(DUE, 10))[0].state.kind, "escalating");
    assert.equal(snapshotAt(f, plus(DUE, 31))[0].state.kind, "ok");
  });

  it("an escalation open at that moment keeps its pinned rules after a later publish", () => {
    const f = facts({
      escalations: [
        {
          id: "e1",
          residentId: "r1",
          policyVersionId: "v1",
          tierKey: "std",
          dueAt: DUE,
          lastSeenAt: SEEN,
          openedAt: plus(DUE, 5),
          openedByName: "Sam",
          resolvedAt: null,
          resolvedByName: null,
        },
      ],
    });
    const s = snapshotAt(f, plus(DUE, 61))[0];
    assert.equal(s.state.kind, "escalating");
    assert.equal(s.state.pinned, true);
    assert.equal(s.state.currentStepIndex, 1);
    assert.equal(s.escalation?.version?.version, 1);
  });

  it("ignores an escalation not yet opened, or already closed, at that moment", () => {
    const esc = {
      id: "e1",
      residentId: "r1",
      policyVersionId: "v1",
      tierKey: "std",
      dueAt: DUE,
      lastSeenAt: SEEN,
      openedAt: plus(DUE, 20),
      openedByName: null,
      resolvedAt: plus(DUE, 25),
      resolvedByName: null,
    };
    const f = facts({ escalations: [esc] });
    assert.equal(snapshotAt(f, plus(DUE, 10))[0].escalation, null);
    assert.equal(snapshotAt(f, plus(DUE, 22))[0].escalation?.id, "e1");
    assert.equal(snapshotAt(f, plus(DUE, 25))[0].escalation, null);
  });

  it("only counts checks that had happened by then, and keeps who logged the latest", () => {
    const later = {
      id: "c2",
      residentId: "r1",
      outcome: "seen" as const,
      method: "in_person" as const,
      happenedAt: plus(SEEN, 100),
      createdAt: plus(SEEN, 100),
      note: null,
      overdueMinutes: null,
      staffName: "Lee",
    };
    const f = facts({ contacts: [...facts().contacts, later] });
    assert.equal(snapshotAt(f, plus(SEEN, 50))[0].lastReset?.staffName, "Sam");
    assert.equal(snapshotAt(f, plus(SEEN, 150))[0].lastReset?.staffName, "Lee");
  });

  it("a plan created later doesn't exist yet", () => {
    const f = facts();
    f.plans[0] = { ...f.plans[0], createdAt: plus(SEEN, 60), startedAt: plus(SEEN, 60) };
    assert.equal(snapshotAt(f, plus(SEEN, 30))[0].state.kind, "no_plan");
  });

  it("an absence that ended later was still in progress then", () => {
    const f = facts({
      absences: [
        {
          id: "a1",
          residentId: "r1",
          startsAt: plus(SEEN, 10),
          expectedBackAt: plus(SEEN, 600),
          reason: null,
          endedAt: plus(SEEN, 120),
          cancelledAt: null,
          createdAt: plus(SEEN, 10),
          createdByName: null,
        },
      ],
    });
    assert.equal(snapshotAt(f, plus(SEEN, 60))[0].state.kind, "away");
    assert.equal(snapshotAt(f, plus(SEEN, 130))[0].absence, null);
  });

  it("leaves discharged residents out", () => {
    const f = facts();
    f.residents[0] = { ...f.residents[0], status: "discharged" };
    assert.equal(snapshotAt(f, SEEN).length, 0);
  });
});

describe("rules preview over a window", () => {
  it("finds the peak and when it happened", () => {
    const f = facts();
    const r = needsActionOverWindow(f, SEEN, plus(DUE, 20), V1, 15);
    assert.equal(r.peak, 1);
    assert.deepEqual(r.peakAt, DUE);
    assert.equal(r.now.escalating, 1);
    const looser = needsActionOverWindow(f, SEEN, plus(DUE, 20), V2, 15);
    assert.equal(looser.peak, 0);
    assert.equal(looser.peakAt, null);
  });
});
