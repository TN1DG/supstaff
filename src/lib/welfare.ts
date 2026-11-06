import type { ShiftType, WelfareMethodValue, WelfareOutcomeValue } from "@/db/schema";
import type { StatusTone } from "@/lib/status-tone";
import type { WelfareKind, WelfareState } from "@/lib/welfare-engine";
import { formatMinutesShort } from "@/lib/welfare-policy";
import { addDays, instantAt } from "@/lib/zoned-time";

/*
 * Display vocabulary for welfare checks — client-safe, one source of truth
 * for labels and tones (same pattern as ROUND_STATUS_META).
 */

export const WELFARE_STATUS_META: Record<WelfareKind, { tone: StatusTone; label: string }> = {
  escalating: { tone: "danger", label: "Escalating" },
  overdue: { tone: "warning", label: "Overdue" },
  due_soon: { tone: "warning", label: "Due soon" },
  no_plan: { tone: "warning", label: "No plan" },
  ok: { tone: "success", label: "OK" },
  away: { tone: "info", label: "Away" },
};

export const OUTCOME_LABEL: Record<WelfareOutcomeValue, string> = {
  seen: "Seen",
  contacted: "Contacted",
  no_response: "No response",
};

export const OUTCOME_HINT: Record<WelfareOutcomeValue, string> = {
  seen: "In person.",
  contacted: "Spoke to them, or they replied.",
  no_response: "Tried, couldn't reach them.",
};

export const METHOD_LABEL: Record<WelfareMethodValue, string> = {
  in_person: "In person",
  door_knock: "Door knock",
  phone: "Phone",
  message: "Text or message",
  other: "Other",
};

export const WELFARE_METHODS = Object.keys(METHOD_LABEL) as WelfareMethodValue[];
export const WELFARE_OUTCOMES = Object.keys(OUTCOME_LABEL) as WelfareOutcomeValue[];

/** The method staff most likely used for an outcome — the dialog's default. */
export const DEFAULT_METHOD: Record<WelfareOutcomeValue, WelfareMethodValue> = {
  seen: "in_person",
  contacted: "phone",
  no_response: "door_knock",
};

export function noPlanMessage(reason: WelfareState["reason"]): string {
  switch (reason) {
    case "no_rules":
      return "No welfare rules published yet";
    case "tier_missing":
      return "Plan's tier isn't in the current rules";
    default:
      return "No welfare plan";
  }
}

/** "2h 10m" between two instants (never negative). */
export function durationBetween(from: Date, to: Date): string {
  return formatMinutesShort(Math.max(0, (to.getTime() - from.getTime()) / 60_000));
}

/** Formatters bound to the site's time zone — never the server's. */
export function welfareFormatters(timeZone: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  const dayTime = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium" });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return {
    /** "03:10" today, "Sun 25 Oct, 03:10" otherwise. */
    when(d: Date, now: Date = new Date()): string {
      return dayKey.format(d) === dayKey.format(now) ? time.format(d) : dayTime.format(d);
    },
    time: (d: Date) => time.format(d),
    dayTime: (d: Date) => dayTime.format(d),
    date: (d: Date) => date.format(d),
  };
}

/**
 * Fixed shift times for the handover's welfare panel — not configurable yet,
 * same posture as ROUND_TIMES. Contiguous, so every moment belongs to
 * exactly one shift. A night handover's date is the evening it starts.
 */
export const SHIFT_WINDOWS: Record<ShiftType, { start: string; end: string }> = {
  early: { start: "07:00", end: "15:00" },
  late: { start: "15:00", end: "23:00" },
  night: { start: "23:00", end: "07:00" },
};

export function shiftWindow(date: string, shift: ShiftType, timeZone: string): { start: Date; end: Date } {
  const w = SHIFT_WINDOWS[shift];
  const start = instantAt(date, w.start, timeZone);
  const end = instantAt(w.end <= w.start ? addDays(date, 1) : date, w.end, timeZone);
  return { start, end };
}
