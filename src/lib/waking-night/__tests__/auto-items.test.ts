import { describe, expect, it } from "vitest";
import { autoOutcomes, type ShiftSnapshot } from "@/lib/waking-night/auto-items";
import { evaluateChecklist } from "@/lib/waking-night/checklist";

const NIGHT_STAFF = "staff-night";

/** A night where everything happened as it should. */
function goodNight(): ShiftSnapshot {
  return {
    nightStaffIds: [NIGHT_STAFF],
    lateHandover: {
      id: "late-1",
      status: "submitted",
      acknowledgements: [{ staffId: NIGHT_STAFF, staffName: "Nia", readAtLabel: "22:05" }],
    },
    nightHandover: {
      id: "night-1",
      status: "submitted",
      submittedAtLabel: "07:20",
      submittedByName: "Nia",
      salesforceStatus: "sent",
    },
    eveningMeds: {
      rounds: ["Bedtime"],
      doses: [
        { residentName: "Ann B", medicationName: "Sertraline", roundLabel: "Bedtime", outcome: "given", missed: false },
      ],
    },
    rounds: ["23:00", "01:00"].map((roundTime) => ({
      roundTime,
      timeliness: "on_time" as const,
      reasonMissing: false,
    })),
    events: [],
    emailFollowUps: [],
  };
}

describe("autoOutcomes on a good night", () => {
  it("ticks all seven auto items, each with evidence", () => {
    const out = autoOutcomes(goodNight());
    expect(Object.keys(out)).toHaveLength(7);
    for (const [key, o] of Object.entries(out)) {
      expect(o.met, key).toBe(true);
      expect(o.evidence.length, key).toBeGreaterThan(0);
    }
    expect(out.handover_received_pm.evidence[0]).toEqual({
      label: "Read by Nia at 22:05",
      href: "/handovers/late-1",
    });
    expect(out.handover_delivered_am.sourceEntityId).toBe("night-1");
  });

  it("makes evaluateChecklist resolve the auto items as auto", () => {
    const items = evaluateChecklist([], autoOutcomes(goodNight()));
    const autos = items.filter((i) => i.kind === "auto");
    expect(autos.every((i) => i.status === "done" && i.resolvedBy === "auto")).toBe(true);
    expect(items.filter((i) => i.kind === "manual").every((i) => i.status === null)).toBe(true);
  });
});

describe("handover received from PM", () => {
  it("needs a late handover", () => {
    expect(autoOutcomes({ ...goodNight(), lateHandover: null }).handover_received_pm.met).toBe(false);
  });

  it("needs it submitted", () => {
    const s = goodNight();
    s.lateHandover!.status = "draft";
    expect(autoOutcomes(s).handover_received_pm.met).toBe(false);
  });

  it("only counts a read receipt from night staff", () => {
    const s = goodNight();
    s.lateHandover!.acknowledgements = [{ staffId: "someone-else", staffName: "Bo", readAtLabel: "21:00" }];
    const o = autoOutcomes(s).handover_received_pm;
    expect(o.met).toBe(false);
    expect(o.evidence[0].label).toMatch(/not yet marked as read/);
  });
});

describe("handover delivered to AM", () => {
  it("is not met while the night handover is a draft or missing", () => {
    const s = goodNight();
    s.nightHandover!.status = "draft";
    expect(autoOutcomes(s).handover_delivered_am.met).toBe(false);
    expect(autoOutcomes({ ...goodNight(), nightHandover: null }).handover_delivered_am.met).toBe(false);
  });
});

describe("evening meds", () => {
  const withDoses = (doses: ShiftSnapshot["eveningMeds"]["doses"]) => {
    const s = goodNight();
    s.eveningMeds.doses = doses;
    return autoOutcomes(s).evening_meds_mar;
  };
  const dose = (outcome: string | null, missed = false) => ({
    residentName: "Ann B",
    medicationName: "Sertraline",
    roundLabel: "Bedtime",
    outcome,
    missed,
  });

  it("is met with no doses scheduled", () => {
    expect(withDoses([]).met).toBe(true);
  });

  it("is met when every dose is recorded, but lists refusals as issues", () => {
    const o = withDoses([dose("given"), dose("refused"), dose("not_available")]);
    expect(o.met).toBe(true);
    expect(o.issues).toEqual([
      "Refused: Sertraline for Ann B (Bedtime)",
      "Not available: Sertraline for Ann B (Bedtime)",
    ]);
  });

  it("is not met with doses still to record", () => {
    const o = withDoses([dose("given"), dose(null)]);
    expect(o.met).toBe(false);
    expect(o.evidence[0].label).toBe("1 dose still to record");
  });

  it("is not met with a missed dose, which shows as an issue", () => {
    const o = withDoses([dose(null, true)]);
    expect(o.met).toBe(false);
    expect(o.issues).toEqual(["Missed: Sertraline for Ann B (Bedtime)"]);
  });
});

describe("H&S building checks", () => {
  it("needs every round finished", () => {
    const s = goodNight();
    s.rounds[1] = { roundTime: "01:00", timeliness: null, reasonMissing: false };
    expect(autoOutcomes(s).hs_building_checks.met).toBe(false);
  });

  it("accepts late/missed rounds once they have a reason", () => {
    const s = goodNight();
    s.rounds[1] = { roundTime: "01:00", timeliness: "missed", reasonMissing: true };
    expect(autoOutcomes(s).hs_building_checks.met).toBe(false);
    s.rounds[1].reasonMissing = false;
    const o = autoOutcomes(s).hs_building_checks;
    expect(o.met).toBe(true);
    expect(o.evidence[0].label).toBe("All 2 rounds logged — 1 on time, 0 late, 1 missed");
  });
});

describe("Shift Planner uploaded to In-Form", () => {
  it("only ticks on a confirmed Salesforce sync", () => {
    for (const status of ["pending", "processing", "failed", null] as const) {
      const s = goodNight();
      s.nightHandover!.salesforceStatus = status;
      expect(autoOutcomes(s).shift_planner_inform.met, String(status)).toBe(false);
    }
  });
});

describe("incidents", () => {
  it("handed over needs every event on the submitted handover", () => {
    const s = goodNight();
    s.events = [
      { id: "e1", label: "Emergency repair", onHandover: true },
      { id: "e2", label: "ASB", onHandover: false },
    ];
    const o = autoOutcomes(s).incidents_handed_over;
    expect(o.met).toBe(false);
    expect(o.evidence).toEqual([{ label: "Not on the handover: ASB" }]);
  });

  it("emailed needs every email follow-up done", () => {
    const s = goodNight();
    s.events = [{ id: "e1", label: "Accident", onHandover: true }];
    s.emailFollowUps = [{ id: "f1", label: "Email the team", status: "open" }];
    expect(autoOutcomes(s).incidents_emailed.met).toBe(false);
    s.emailFollowUps[0].status = "done";
    expect(autoOutcomes(s).incidents_emailed.met).toBe(true);
  });

  it("emailed is met when there were no incidents", () => {
    expect(autoOutcomes(goodNight()).incidents_emailed.met).toBe(true);
  });
});
