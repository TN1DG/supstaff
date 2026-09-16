import type { MedicationOutcomeValue } from "@/db/schema";
import { isoDate } from "@/lib/night-checks";
import type { StatusTone } from "@/lib/status-tone";

export { isoDate };

/**
 * Fixed daily rounds — plain text (not a pg enum), same posture as
 * ROUND_TIMES in night-checks.ts, so a 5th round can be added later
 * without a migration. Not manager-configurable yet.
 */
export const MEDICATION_ROUNDS = [
  { round: "morning", label: "Morning", time: "08:00" },
  { round: "lunchtime", label: "Lunchtime", time: "12:00" },
  { round: "teatime", label: "Teatime", time: "17:00" },
  { round: "bedtime", label: "Bedtime", time: "22:00" },
] as const;

export type MedicationRound = (typeof MEDICATION_ROUNDS)[number]["round"];

export function isMedicationRound(value: string): value is MedicationRound {
  return (MEDICATION_ROUNDS as readonly { round: string }[]).some((r) => r.round === value);
}

export function roundLabel(round: string): string {
  return MEDICATION_ROUNDS.find((r) => r.round === round)?.label ?? round;
}

/** The scheduled clock time for a round, on a given calendar date. */
export function medicationRoundScheduledAt(dateIso: string, round: MedicationRound): Date {
  const entry = MEDICATION_ROUNDS.find((r) => r.round === round)!;
  const [h, m] = entry.time.split(":").map(Number);
  const d = new Date(`${dateIso}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/** A dose's window runs until the next round starts (or +2h after bedtime) before it counts as overdue. */
function roundWindowEnd(dateIso: string, round: MedicationRound): Date {
  const idx = MEDICATION_ROUNDS.findIndex((r) => r.round === round);
  const next = MEDICATION_ROUNDS[idx + 1];
  if (next) return medicationRoundScheduledAt(dateIso, next.round);
  const end = medicationRoundScheduledAt(dateIso, round);
  end.setHours(end.getHours() + 2);
  return end;
}

/** Whether a round's window has fully closed — used by reports to decide if an unrecorded dose counts as missed. */
export function isRoundWindowClosed(dateIso: string, round: MedicationRound, now: Date): boolean {
  return now >= roundWindowEnd(dateIso, round);
}

export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayCode = (typeof DAY_CODES)[number];

export function dayCode(d: Date): DayCode {
  return DAY_CODES[d.getDay()];
}

export function isScheduledToday(
  schedule: { roundSlot: string; daysOfWeek: string[] },
  round: MedicationRound,
  date: Date,
): boolean {
  return schedule.roundSlot === round && schedule.daysOfWeek.includes(dayCode(date));
}

export type DisplayDoseStatus = "not_due" | "due" | "missed" | MedicationOutcomeValue;

/**
 * The status to show for a scheduled dose right now. Unlike night-check
 * rounds there's no separate stored "status" column — the administration
 * row's own `outcome` *is* the status once one exists.
 */
export function displayDoseStatus(
  scheduledAt: Date,
  outcome: MedicationOutcomeValue | null,
  now: Date,
  dateIso: string,
  round: MedicationRound,
): DisplayDoseStatus {
  if (outcome) return outcome;
  if (now < scheduledAt) return "not_due";
  if (now < roundWindowEnd(dateIso, round)) return "due";
  return "missed";
}

/**
 * The single source of truth for how a dose status renders — color tone +
 * label. Replaces the per-page STATUS_STYLE/STATUS_LABEL copies.
 * `not_available` is `info` rather than `warning`: it's a supply/logistics
 * fact, not a clinical concern like `refused`/`omitted`.
 */
export const DOSE_STATUS_META: Record<DisplayDoseStatus, { tone: StatusTone; label: string }> = {
  not_due: { tone: "neutral", label: "Not due yet" },
  due: { tone: "warning", label: "Due now" },
  missed: { tone: "danger", label: "Missed" },
  given: { tone: "success", label: "Given" },
  self_admin: { tone: "success", label: "Self-administered" },
  refused: { tone: "warning", label: "Refused" },
  omitted: { tone: "warning", label: "Omitted" },
  not_available: { tone: "info", label: "Not available" },
};

/** Pure safety check — reused by the recording dialog (as a warning banner) and recordAdministration. */
export function checkPrnSafety(
  medication: { prnMaxDosePerDay: number | null; prnMinIntervalMinutes: number | null },
  givenToday: { administeredAt: Date }[],
  now: Date,
): { warning: string | null } {
  if (medication.prnMaxDosePerDay != null && givenToday.length >= medication.prnMaxDosePerDay) {
    return {
      warning: `Already given ${givenToday.length} time${givenToday.length === 1 ? "" : "s"} today — max is ${medication.prnMaxDosePerDay}.`,
    };
  }
  if (medication.prnMinIntervalMinutes != null && givenToday.length > 0) {
    const lastGivenAt = givenToday
      .map((d) => d.administeredAt.getTime())
      .sort((a, b) => b - a)[0];
    const minutesSince = Math.round((now.getTime() - lastGivenAt) / 60000);
    if (minutesSince < medication.prnMinIntervalMinutes) {
      return {
        warning: `Only ${minutesSince} minute${minutesSince === 1 ? "" : "s"} since the last dose — minimum interval is ${medication.prnMinIntervalMinutes} minutes.`,
      };
    }
  }
  return { warning: null };
}
