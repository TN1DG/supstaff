import { describe, expect, it } from "vitest";
import { evaluateChecklist, CHECKLIST_ITEMS } from "@/lib/waking-night/checklist";
import { signOffBlockers } from "@/lib/waking-night/sign-off";

const allDone = evaluateChecklist(
  CHECKLIST_ITEMS.map((i) => ({ itemKey: i.key, status: "done" as const, reason: "ok" })),
);
const goodRounds = ["23:00", "01:00"].map((roundTime) => ({
  roundTime,
  state: "on_time" as const,
  timeliness: "on_time" as const,
  reasonMissing: false,
}));

describe("signOffBlockers", () => {
  it("is empty when everything is resolved", () => {
    expect(signOffBlockers({ items: allDone, rounds: goodRounds, followUps: [] })).toEqual([]);
  });

  it("lists unresolved checklist items", () => {
    const items = evaluateChecklist([]);
    const blockers = signOffBlockers({ items, rounds: goodRounds });
    expect(blockers).toHaveLength(12);
    expect(blockers[0]).toMatch(/isn't resolved/);
  });

  it("blocks on rounds still open", () => {
    for (const state of ["scheduled", "due", "overdue", "in_progress"] as const) {
      const blockers = signOffBlockers({
        items: allDone,
        rounds: [{ roundTime: "07:00", state, timeliness: null, reasonMissing: false }],
      });
      expect(blockers).toEqual(["The 07:00 round isn't finished yet."]);
    }
  });

  it("blocks on late or missed rounds without a reason, not with one", () => {
    const late = { roundTime: "03:00", state: "late" as const, timeliness: "late" as const };
    expect(
      signOffBlockers({ items: allDone, rounds: [{ ...late, reasonMissing: true }] }),
    ).toEqual(["The 03:00 round was late — add a reason."]);
    expect(signOffBlockers({ items: allDone, rounds: [{ ...late, reasonMissing: false }] })).toEqual([]);
    expect(
      signOffBlockers({
        items: allDone,
        rounds: [{ roundTime: "05:00", state: "missed", timeliness: "missed", reasonMissing: true }],
      }),
    ).toEqual(["The 05:00 round was missed — add a reason."]);
  });

  it("blocks on open follow-ups only", () => {
    const blockers = signOffBlockers({
      items: allDone,
      rounds: goodRounds,
      followUps: [
        { label: "Call OOH repairs", status: "open" },
        { label: "Email the team", status: "done" },
        { label: "Police", status: "na" },
        { label: "On-call", status: "not_done" },
      ],
    });
    expect(blockers).toEqual(["Follow-up “Call OOH repairs” is still open."]);
  });
});
