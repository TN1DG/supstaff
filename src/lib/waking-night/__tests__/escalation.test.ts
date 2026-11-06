import { describe, expect, it } from "vitest";
import {
  NIGHT_EVENT_SEVERITIES,
  NIGHT_EVENT_TYPES,
  followUpsFor,
  type NightEventSeverity,
  type NightEventType,
} from "@/lib/waking-night/escalation";

const kinds = (type: NightEventType, severity: NightEventSeverity = "minor_managed") =>
  followUpsFor({ type, severity }).map((f) => f.kind);

describe("followUpsFor — minor, already managed", () => {
  it("emergency repair: OOH call, repairs log, email", () => {
    expect(kinds("emergency_repair")).toEqual(["call_ooh_repairs", "update_repairs_log", "email_team"]);
  });

  it("accident or incident: SAW-IT form, email", () => {
    expect(kinds("accident_incident")).toEqual(["sawit_incident_form", "email_team"]);
  });

  it("ASB: In-Form, verbal + written handover, police if needed", () => {
    expect(kinds("anti_social_behaviour")).toEqual([
      "record_inform",
      "verbal_handover",
      "written_handover",
      "contact_emergency_services",
    ]);
  });

  it("customer unwell: 999 or 111", () => {
    const [f] = followUpsFor({ type: "customer_unwell", severity: "minor_managed" });
    expect(f).toMatchObject({ kind: "call_999_or_111", choices: ["999", "111"] });
  });

  it("staff threatened: 999 or 101", () => {
    const [f] = followUpsFor({ type: "staff_threatened", severity: "minor_managed" });
    expect(f).toMatchObject({ kind: "call_999_or_101", choices: ["999", "101"] });
  });
});

describe("on-call manager rule", () => {
  it("a serious incident always needs the on-call manager, at either severity", () => {
    expect(kinds("serious_incident", "minor_managed")).toEqual(["contact_on_call_manager"]);
    expect(kinds("serious_incident", "serious")).toEqual(["contact_on_call_manager"]);
  });

  it("is added to any event marked serious", () => {
    for (const type of NIGHT_EVENT_TYPES) {
      expect(kinds(type, "serious"), type).toContain("contact_on_call_manager");
    }
  });

  it("is never created for a minor incident that's already managed", () => {
    for (const type of NIGHT_EVENT_TYPES.filter((t) => t !== "serious_incident")) {
      expect(kinds(type, "minor_managed"), type).not.toContain("contact_on_call_manager");
    }
  });
});

describe("follow-up shapes", () => {
  it("every event type at every severity creates at least one follow-up, with unique kinds", () => {
    for (const type of NIGHT_EVENT_TYPES) {
      for (const severity of NIGHT_EVENT_SEVERITIES) {
        const list = kinds(type, severity);
        expect(list.length, `${type}/${severity}`).toBeGreaterThan(0);
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });

  it("only 'police if needed' allows N/A", () => {
    const naKinds = NIGHT_EVENT_TYPES.flatMap((type) =>
      followUpsFor({ type, severity: "serious" }).filter((f) => f.allowNa).map((f) => f.kind),
    );
    expect(naKinds).toEqual(["contact_emergency_services"]);
  });

  it("auto follow-ups are the repairs log and the written handover", () => {
    const autos = NIGHT_EVENT_TYPES.flatMap((type) =>
      followUpsFor({ type, severity: "minor_managed" }).filter((f) => f.auto).map((f) => f.auto),
    );
    expect(autos).toEqual(["repairs_log", "written_handover"]);
  });
});

describe("schema enums stay in step", () => {
  it("night_event_type matches NIGHT_EVENT_TYPES", async () => {
    const { nightEventType, nightEventSeverity } = await import("@/db/schema");
    expect(nightEventType.enumValues).toEqual([...NIGHT_EVENT_TYPES]);
    expect(nightEventSeverity.enumValues).toEqual([...NIGHT_EVENT_SEVERITIES]);
  });
});
