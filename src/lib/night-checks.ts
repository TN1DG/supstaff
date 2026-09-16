import type { NightCheckItemStatusValue, NightCheckRoundStatusValue } from "@/db/schema";
import type { StatusTone } from "@/lib/status-tone";

/**
 * Fixed round slots, 23:00 → 07:00 every two hours. Not manager-configurable
 * yet (the plan flagged this as a nice-to-have) — revisit if the service
 * needs a different cadence.
 */
export const ROUND_TIMES = ["23:00", "01:00", "03:00", "05:00", "07:00"] as const;
export type RoundTime = (typeof ROUND_TIMES)[number];

export function isRoundTime(value: string): value is RoundTime {
  return (ROUND_TIMES as readonly string[]).includes(value);
}

/**
 * Format a Date as its *local* calendar date. Never use `toISOString()` for
 * this — it converts to UTC first, which silently shifts the date by one
 * whenever the server's local offset is non-zero (exactly the kind of bug
 * that bites only near midnight, in whichever timezone Vercel runs in).
 */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Which "night" `now` belongs to, as a `check_date`. The 23:00 round shares a
 * date with the four rounds after midnight, so anything before noon counts
 * as the previous calendar day's night.
 */
export function currentNightOf(now: Date): string {
  const d = new Date(now);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

/** The actual scheduled instant for a round — 01:00–07:00 land on the next calendar day. */
export function roundScheduledAt(checkDate: string, roundTime: RoundTime): Date {
  const [h, m] = roundTime.split(":").map(Number);
  const d = new Date(`${checkDate}T00:00:00`);
  if (h < 12) d.setDate(d.getDate() + 1); // 01:00/03:00/05:00/07:00 roll to the next day
  d.setHours(h, m, 0, 0);
  return d;
}

/** A round's window runs until the next slot (or 2h after 07:00) before it counts as overdue. */
function roundWindowEnd(checkDate: string, roundTime: RoundTime): Date {
  const idx = ROUND_TIMES.indexOf(roundTime);
  const next = ROUND_TIMES[idx + 1];
  if (next) return roundScheduledAt(checkDate, next);
  const end = roundScheduledAt(checkDate, roundTime);
  end.setHours(end.getHours() + 2);
  return end;
}

export type DisplayRoundStatus =
  | "not_due"
  | "due"
  | NightCheckRoundStatusValue;

/**
 * The status to show for a round slot right now. When no row exists yet this
 * is computed live (`not_due` / `due` / `missed`) — the daily cron later
 * persists a `missed` row for the record; it doesn't need to run for the UI
 * to be accurate.
 */
export function displayRoundStatus(
  checkDate: string,
  roundTime: RoundTime,
  storedStatus: NightCheckRoundStatusValue | null,
  now: Date,
): DisplayRoundStatus {
  if (storedStatus) return storedStatus;
  const scheduled = roundScheduledAt(checkDate, roundTime);
  if (now < scheduled) return "not_due";
  if (now < roundWindowEnd(checkDate, roundTime)) return "due";
  return "missed";
}

/**
 * The single source of truth for how a round status renders — color tone +
 * label. Replaces the three independent encodings that used to live in
 * night-checks/page.tsx (dot-grid), night-checks/[id]/page.tsx (header
 * badge), and round-checklist.tsx. `in_progress` is `info` (teal), not
 * `warning` — it needs to look distinctly different from "due" (hasn't
 * started) rather than just a lighter shade of the same amber.
 */
export const ROUND_STATUS_META: Record<DisplayRoundStatus, { tone: StatusTone; label: string }> = {
  not_due: { tone: "neutral", label: "Not due yet" },
  due: { tone: "warning", label: "Due now" },
  in_progress: { tone: "info", label: "In progress" },
  complete: { tone: "success", label: "Complete" },
  missed: { tone: "danger", label: "Missed" },
};

/** The single source of truth for how a checklist item status renders. */
export const CHECKLIST_ITEM_STATUS_META: Record<
  NightCheckItemStatusValue,
  { tone: StatusTone; label: string }
> = {
  ok: { tone: "success", label: "OK" },
  attention: { tone: "warning", label: "Needs attention" },
  na: { tone: "neutral", label: "N/A" },
};

/**
 * Fixed floor/room layout for the resident-welfare drill-down — one building,
 * 15 rooms, matching the seeded residents' `room` values exactly. Not
 * manager-configurable yet, same posture as `ROUND_TIMES`.
 */
export const FLOORS = [
  { floor: 1, rooms: [1, 2, 3, 4, 5] },
  { floor: 2, rooms: [6, 7, 8, 9, 10] },
  { floor: 3, rooms: [11, 12, 13, 14, 15] },
] as const;

export const ALL_ROOM_NUMBERS: number[] = FLOORS.flatMap((f) => [...f.rooms]);

/** Which floor a room number belongs to, or `null` if it isn't a real room. */
export function roomFloor(roomNumber: number): number | null {
  return FLOORS.find((f) => (f.rooms as readonly number[]).includes(roomNumber))?.floor ?? null;
}

export function isValidRoomNumber(n: number): boolean {
  return roomFloor(n) !== null;
}
