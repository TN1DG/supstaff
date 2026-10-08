import { describe, expect, it } from "vitest";
import {
  buildRoundSchedule,
  liveRoundState,
  needsReason,
  roundTimeliness,
  sortNightSlots,
} from "@/lib/waking-night/rounds";

const LONDON = "Europe/London";
const NIGHT = "2026-01-15"; // GMT, so UTC == local
const TIMES = ["23:00", "01:00", "03:00", "05:00", "07:00"];
const schedule = buildRoundSchedule(TIMES, NIGHT, LONDON);
const first = schedule[0];
const last = schedule[schedule.length - 1];
const min = (n: number) => n * 60_000;
const plus = (d: Date, minutes: number) => new Date(d.getTime() + min(minutes));

describe("buildRoundSchedule", () => {
  it("creates one slot per configured time, in night order", () => {
    expect(schedule.map((s) => s.roundTime)).toEqual(TIMES);
    expect(first.scheduledAt.toISOString()).toBe("2026-01-15T23:00:00.000Z");
    expect(schedule[1].scheduledAt.toISOString()).toBe("2026-01-16T01:00:00.000Z");
  });

  it("uses the next slot as the cutoff, and +2h for the last", () => {
    expect(first.cutoff).toEqual(schedule[1].scheduledAt);
    expect(last.cutoff.toISOString()).toBe("2026-01-16T09:00:00.000Z");
  });

  it("respects a custom schedule regardless of input order", () => {
    const custom = buildRoundSchedule(["02:00", "22:30", "06:00", "22:30"], NIGHT, LONDON);
    expect(custom.map((s) => s.roundTime)).toEqual(["22:30", "02:00", "06:00"]);
  });

  it("schedules in local time during BST", () => {
    const summer = buildRoundSchedule(TIMES, "2026-07-01", LONDON);
    expect(summer[0].scheduledAt.toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });
});

describe("sortNightSlots", () => {
  it("orders evening before morning", () => {
    expect(sortNightSlots(["07:00", "23:00", "01:00"])).toEqual(["23:00", "01:00", "07:00"]);
  });
});

describe("roundTimeliness (tolerance 30 min)", () => {
  const judge = (offsetMinutes: number | null, slot = first) =>
    roundTimeliness({
      scheduledAt: slot.scheduledAt,
      cutoff: slot.cutoff,
      completedAt: offsetMinutes === null ? null : plus(slot.scheduledAt, offsetMinutes),
      toleranceMinutes: 30,
    });

  it("is on time inside ±T, inclusive", () => {
    expect(judge(0)).toBe("on_time");
    expect(judge(-30)).toBe("on_time");
    expect(judge(30)).toBe("on_time");
  });

  it("is late just outside the window", () => {
    expect(judge(31)).toBe("late");
    expect(judge(119)).toBe("late");
  });

  it("counts finishing more than T early as late (off schedule)", () => {
    expect(judge(-31)).toBe("late");
  });

  it("is missed at the next slot's time, or when never completed", () => {
    expect(judge(120)).toBe("missed");
    expect(judge(null)).toBe("missed");
  });

  it("gives the last round two hours", () => {
    expect(judge(119, last)).toBe("late");
    expect(judge(120, last)).toBe("missed");
  });

  it("honours a different tolerance", () => {
    expect(
      roundTimeliness({
        scheduledAt: first.scheduledAt,
        cutoff: first.cutoff,
        completedAt: plus(first.scheduledAt, 20),
        toleranceMinutes: 15,
      }),
    ).toBe("late");
  });
});

describe("needsReason", () => {
  it("only for late or missed", () => {
    expect(needsReason("on_time")).toBe(false);
    expect(needsReason("late")).toBe(true);
    expect(needsReason("missed")).toBe(true);
    expect(needsReason(null)).toBe(false);
  });
});

describe("liveRoundState", () => {
  const state = (nowOffset: number, opts: { started?: number; completed?: number } = {}) =>
    liveRoundState({
      scheduledAt: first.scheduledAt,
      cutoff: first.cutoff,
      toleranceMinutes: 30,
      startedAt: opts.started === undefined ? null : plus(first.scheduledAt, opts.started),
      completedAt: opts.completed === undefined ? null : plus(first.scheduledAt, opts.completed),
      now: plus(first.scheduledAt, nowOffset),
    });

  it("walks scheduled → due → overdue → missed", () => {
    expect(state(-31)).toBe("scheduled");
    expect(state(-30)).toBe("due");
    expect(state(30)).toBe("due");
    expect(state(31)).toBe("overdue");
    expect(state(120)).toBe("missed");
  });

  it("shows in progress once checked in, until the cutoff", () => {
    expect(state(10, { started: 5 })).toBe("in_progress");
    expect(state(121, { started: 5 })).toBe("missed");
  });

  it("shows timeliness once completed", () => {
    expect(state(200, { started: 0, completed: 10 })).toBe("on_time");
    expect(state(200, { started: 40, completed: 45 })).toBe("late");
  });
});
