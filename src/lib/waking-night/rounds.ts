import { isMorningSlot, nightSlotAt } from "@/lib/site-time";

/**
 * Welfare-round timing rules. Pure functions only — the server actions, the
 * cron sweep and the sign-off check all call these so "late" means the same
 * thing everywhere. A welfare round is a floor-level walk with no room entry;
 * "patrol" and "welfare round" are the same `night_check_rounds` row.
 */

export const DEFAULT_ROUND_TIMES = ["23:00", "01:00", "03:00", "05:00", "07:00"];
export const DEFAULT_TOLERANCE_MINUTES = 30;
/** How long after the last round it stays recoverable (late) before it's missed. */
export const LAST_ROUND_GRACE_MINUTES = 120;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidSlotTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Minutes into the night, so 23:00 sorts before 01:00. */
function nightMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (isMorningSlot(time) ? h + 24 : h) * 60 + m;
}

/** Slot times in the order they happen across the night, de-duplicated. */
export function sortNightSlots(times: readonly string[]): string[] {
  return [...new Set(times)].sort((a, b) => nightMinutes(a) - nightMinutes(b));
}

export type ScheduledSlot = {
  roundTime: string;
  scheduledAt: Date;
  /** After this the round can't be late any more — it's missed. */
  cutoff: Date;
};

/**
 * The night's schedule: each slot's instant (in the site's timezone) and its
 * cutoff, which is the next slot's time — or `LAST_ROUND_GRACE_MINUTES` after
 * the last one.
 */
export function buildRoundSchedule(
  roundTimes: readonly string[],
  night: string,
  tz: string,
): ScheduledSlot[] {
  const sorted = sortNightSlots(roundTimes);
  const at = sorted.map((t) => nightSlotAt(night, t, tz));
  return sorted.map((roundTime, i) => ({
    roundTime,
    scheduledAt: at[i],
    cutoff:
      at[i + 1] ?? new Date(at[i].getTime() + LAST_ROUND_GRACE_MINUTES * 60_000),
  }));
}

export type RoundTimeliness = "on_time" | "late" | "missed";

/**
 * How a round went, judged on when it was *completed*:
 * - on time: within ±tolerance of the scheduled time;
 * - late: outside that window but before the cutoff — this includes doing it
 *   more than `tolerance` early ("off schedule");
 * - missed: never completed, or completed at/after the cutoff.
 */
export function roundTimeliness(input: {
  scheduledAt: Date;
  cutoff: Date;
  completedAt: Date | null;
  toleranceMinutes: number;
}): RoundTimeliness {
  const { scheduledAt, cutoff, completedAt, toleranceMinutes } = input;
  if (!completedAt || completedAt >= cutoff) return "missed";
  const tol = toleranceMinutes * 60_000;
  const diff = completedAt.getTime() - scheduledAt.getTime();
  return Math.abs(diff) <= tol ? "on_time" : "late";
}

export function needsReason(t: RoundTimeliness | null | undefined): boolean {
  return t === "late" || t === "missed";
}

/**
 * What to show for a round right now. Completed rounds show their timeliness;
 * open ones walk scheduled → due (inside the window) → overdue (late but still
 * recoverable) → missed (past the cutoff).
 */
export type LiveRoundState =
  | "scheduled"
  | "due"
  | "overdue"
  | "in_progress"
  | "missed"
  | RoundTimeliness;

/** The subset of a `night_check_rounds` row the timing rules need. */
export type StoredRoundLike = {
  roundTime: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  status: "scheduled" | "in_progress" | "complete" | "missed";
  timelinessReason: string | null;
};

export type NightRound<T extends StoredRoundLike> = {
  roundTime: string;
  scheduledAt: Date;
  cutoff: Date;
  row: T | null;
  state: LiveRoundState;
  /** Final verdict once the round is done or past its cutoff, else null. */
  timeliness: RoundTimeliness | null;
  /** Late/missed and nobody has said why yet. */
  reasonMissing: boolean;
};

/**
 * Line tonight's stored rows up against the schedule. A row's own
 * `scheduledAt` wins over the current config, so editing the schedule never
 * rewrites history; rows for a slot that's since been removed still show.
 */
export function mergeNightRounds<T extends StoredRoundLike>(
  schedule: ScheduledSlot[],
  rows: T[],
  toleranceMinutes: number,
  now: Date,
): NightRound<T>[] {
  const byTime = new Map(rows.map((r) => [r.roundTime, r]));
  const slots: { roundTime: string; scheduledAt: Date; cutoff: Date; row: T | null }[] =
    schedule.map((slot) => {
      const row = byTime.get(slot.roundTime) ?? null;
      return { ...slot, scheduledAt: row?.scheduledAt ?? slot.scheduledAt, row };
    });
  for (const row of rows) {
    if (!row.scheduledAt || schedule.some((s) => s.roundTime === row.roundTime)) continue;
    slots.push({
      roundTime: row.roundTime,
      scheduledAt: row.scheduledAt,
      cutoff: new Date(row.scheduledAt.getTime() + LAST_ROUND_GRACE_MINUTES * 60_000),
      row,
    });
  }
  slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return slots.map(({ roundTime, scheduledAt, cutoff, row }) => {
    const state: LiveRoundState =
      row?.status === "missed" && !row.completedAt
        ? "missed"
        : liveRoundState({
            scheduledAt,
            cutoff,
            toleranceMinutes,
            startedAt: row?.startedAt ?? null,
            completedAt: row?.completedAt ?? null,
            now,
          });
    const timeliness =
      state === "on_time" || state === "late" || state === "missed" ? state : null;
    return {
      roundTime,
      scheduledAt,
      cutoff,
      row,
      state,
      timeliness,
      reasonMissing: needsReason(timeliness) && !row?.timelinessReason?.trim(),
    };
  });
}

export function liveRoundState(input: {
  scheduledAt: Date;
  cutoff: Date;
  toleranceMinutes: number;
  startedAt: Date | null;
  completedAt: Date | null;
  now: Date;
}): LiveRoundState {
  const { scheduledAt, cutoff, toleranceMinutes, startedAt, completedAt, now } = input;
  if (completedAt) {
    return roundTimeliness({ scheduledAt, cutoff, completedAt, toleranceMinutes });
  }
  if (now >= cutoff) return "missed";
  if (startedAt) return "in_progress";
  const tol = toleranceMinutes * 60_000;
  if (now.getTime() < scheduledAt.getTime() - tol) return "scheduled";
  if (now.getTime() <= scheduledAt.getTime() + tol) return "due";
  return "overdue";
}
