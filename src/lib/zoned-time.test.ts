import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  instantAt,
  mostRecentWallTime,
  parseLocalDateTime,
  toLocalDateTimeValue,
  zonedDate,
} from "@/lib/zoned-time";
import { shiftWindow } from "@/lib/welfare";

const LONDON = "Europe/London";
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("UK wall time to an instant", () => {
  it("summer time is an hour ahead of UTC", () => {
    assert.equal(iso(instantAt("2026-10-19", "03:10", LONDON)), "2026-10-19T02:10:00.000Z");
  });

  it("winter time is UTC", () => {
    assert.equal(iso(instantAt("2026-11-02", "03:10", LONDON)), "2026-11-02T03:10:00.000Z");
  });

  it("01:30 happens twice when the clocks go back; the first (BST) one is used", () => {
    assert.equal(iso(instantAt("2026-10-25", "01:30", LONDON)), "2026-10-25T00:30:00.000Z");
  });

  it("01:30 never happens when the clocks go forward; it reads as 02:30 BST", () => {
    assert.equal(iso(instantAt("2026-03-29", "01:30", LONDON)), "2026-03-29T01:30:00.000Z");
  });
});

describe("a typed time means the most recent time the clock showed it", () => {
  // 00:10 BST on 21 Oct.
  const now = new Date("2026-10-20T23:10:00Z");

  it("23:50 typed at 00:10 is last night", () => {
    assert.equal(iso(mostRecentWallTime("23:50", now, LONDON)), "2026-10-20T22:50:00.000Z");
  });

  it("00:05 typed at 00:10 is five minutes ago", () => {
    assert.equal(iso(mostRecentWallTime("00:05", now, LONDON)), "2026-10-20T23:05:00.000Z");
  });

  it("a minute ahead of the clock is allowed for skew", () => {
    assert.equal(iso(mostRecentWallTime("00:11", now, LONDON)), "2026-10-20T23:11:00.000Z");
  });

  it("rejects what isn't HH:MM", () => {
    assert.equal(mostRecentWallTime("24:00", now, LONDON), null);
    assert.equal(mostRecentWallTime("3:10", now, LONDON), null);
    assert.equal(mostRecentWallTime("", now, LONDON), null);
  });
});

describe("dates and datetime-local values", () => {
  it("the UK date can be a day ahead of the UTC date", () => {
    assert.equal(zonedDate(new Date("2026-10-19T23:30:00Z"), LONDON), "2026-10-20");
  });

  it("adds calendar days across a month end", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  it("round-trips a datetime-local value in UK time", () => {
    const d = parseLocalDateTime("2026-10-24T18:00", LONDON);
    assert.equal(iso(d), "2026-10-24T17:00:00.000Z");
    assert.equal(toLocalDateTimeValue(d!, LONDON), "2026-10-24T18:00");
    assert.equal(parseLocalDateTime("2026-10-24 18:00", LONDON), null);
  });
});

describe("shift windows", () => {
  it("a night shift runs 23:00 to 07:00 the next morning", () => {
    const w = shiftWindow("2026-10-19", "night", LONDON);
    assert.equal(iso(w.start), "2026-10-19T22:00:00.000Z");
    assert.equal(iso(w.end), "2026-10-20T06:00:00.000Z");
  });

  it("the night the clocks go back is 9 real hours long", () => {
    const w = shiftWindow("2026-10-24", "night", LONDON);
    assert.equal((w.end.getTime() - w.start.getTime()) / 3_600_000, 9);
  });

  it("early and late meet without a gap", () => {
    assert.equal(
      iso(shiftWindow("2026-10-19", "early", LONDON).end),
      iso(shiftWindow("2026-10-19", "late", LONDON).start),
    );
  });
});
