import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_ITEM_BY_KEY,
  evaluateChecklist,
  validateResolution,
} from "@/lib/waking-night/checklist";

const item = (key: string) => {
  const def = CHECKLIST_ITEM_BY_KEY.get(key);
  if (!def) throw new Error(`no item ${key}`);
  return def;
};

describe("checklist registry", () => {
  it("has the 12 items from the paper sheet, 7 auto and 5 manual", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(12);
    expect(CHECKLIST_ITEMS.filter((i) => i.kind === "auto")).toHaveLength(7);
    expect(new Set(CHECKLIST_ITEMS.map((i) => i.key)).size).toBe(12);
  });

  it("only allows N/A for the CCTV-information item", () => {
    expect(CHECKLIST_ITEMS.filter((i) => i.allowNa).map((i) => i.key)).toEqual([
      "cctv_info_recorded",
    ]);
  });
});

describe("validateResolution", () => {
  it("accepts a manual item done with no reason", () => {
    expect(validateResolution(item("bins_out"), "done", "")).toBeNull();
  });

  it("requires a reason for not done", () => {
    expect(validateResolution(item("bins_out"), "not_done", "  ")).toMatch(/why/);
    expect(validateResolution(item("bins_out"), "not_done", "Bin store locked")).toBeNull();
  });

  it("rejects N/A unless the item allows it", () => {
    expect(validateResolution(item("bins_out"), "na", "x")).toMatch(/N\/A/);
    expect(validateResolution(item("cctv_info_recorded"), "na", null)).toBeNull();
  });

  it("requires a reason to tick an auto item by hand", () => {
    expect(validateResolution(item("handover_received_pm"), "done", "")).toMatch(/by hand/);
    expect(
      validateResolution(item("handover_received_pm"), "done", "Verbal handover, PM forgot to submit"),
    ).toBeNull();
  });
});

describe("evaluateChecklist", () => {
  it("leaves everything unresolved with no data", () => {
    expect(evaluateChecklist([]).every((i) => i.status === null)).toBe(true);
  });

  it("uses manual results", () => {
    const res = evaluateChecklist([{ itemKey: "bins_out", status: "not_done", reason: "Locked" }]);
    const bins = res.find((i) => i.key === "bins_out")!;
    expect(bins).toMatchObject({ status: "not_done", resolvedBy: "manual", reason: "Locked" });
  });

  it("an auto outcome that's met wins over a manual row", () => {
    const res = evaluateChecklist(
      [{ itemKey: "handover_delivered_am", status: "not_done", reason: "x" }],
      { handover_delivered_am: { met: true, evidence: [{ label: "Night handover", href: "/handovers/1" }] } },
    );
    const it = res.find((i) => i.key === "handover_delivered_am")!;
    expect(it).toMatchObject({ status: "done", resolvedBy: "auto" });
    expect(it.evidence[0].href).toBe("/handovers/1");
  });

  it("an unmet auto outcome falls back to the manual row, keeping its evidence", () => {
    const res = evaluateChecklist(
      [{ itemKey: "shift_planner_inform", status: "done", reason: "Uploaded by hand" }],
      { shift_planner_inform: { met: false, evidence: [{ label: "Sync not confirmed" }] } },
    );
    const it = res.find((i) => i.key === "shift_planner_inform")!;
    expect(it).toMatchObject({ status: "done", resolvedBy: "manual" });
    expect(it.evidence[0].label).toBe("Sync not confirmed");
  });

  it("ignores auto outcomes for manual items", () => {
    const res = evaluateChecklist([], { bins_out: { met: true, evidence: [] } });
    expect(res.find((i) => i.key === "bins_out")!.status).toBeNull();
  });
});
