import { describe, expect, it } from "vitest";
import { nightOf, nightSlotAt } from "@/lib/site-time";
import { zonedDate } from "@/lib/zoned-time";

const LONDON = "Europe/London";

describe("nightSlotAt across the clock changes", () => {
  it("spring forward (night of Sat 28 Mar 2026)", () => {
    const at = (t: string) => nightSlotAt("2026-03-28", t, LONDON).toISOString();
    expect(at("23:00")).toBe("2026-03-28T23:00:00.000Z");
    expect(at("01:00")).toBe("2026-03-29T01:00:00.000Z"); // still GMT
    expect(at("03:00")).toBe("2026-03-29T02:00:00.000Z"); // now BST
    expect(at("07:00")).toBe("2026-03-29T06:00:00.000Z");
  });

  it("fall back (night of Sat 24 Oct 2026)", () => {
    const at = (t: string) => nightSlotAt("2026-10-24", t, LONDON).toISOString();
    expect(at("23:00")).toBe("2026-10-24T22:00:00.000Z"); // BST
    expect(at("03:00")).toBe("2026-10-25T03:00:00.000Z"); // GMT
    expect(at("07:00")).toBe("2026-10-25T07:00:00.000Z");
  });
});

describe("nightOf", () => {
  it("puts the small hours on the previous evening", () => {
    expect(nightOf(new Date("2026-07-02T00:30:00Z"), LONDON)).toBe("2026-07-01"); // 01:30 BST
  });

  it("switches at local noon, not UTC noon", () => {
    expect(nightOf(new Date("2026-07-01T10:59:00Z"), LONDON)).toBe("2026-06-30"); // 11:59 BST
    expect(nightOf(new Date("2026-07-01T11:00:00Z"), LONDON)).toBe("2026-07-01"); // 12:00 BST
  });

  it("handles local midnight that is still yesterday in UTC", () => {
    // 00:15 BST on 1 Jul is 23:15 UTC on 30 Jun.
    expect(zonedDate(new Date("2026-06-30T23:15:00Z"), LONDON)).toBe("2026-07-01");
  });
});
