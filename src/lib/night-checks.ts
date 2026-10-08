import type { NightCheckItemStatusValue, NightCheckRoundStatusValue } from "@/db/schema";
import type { StatusTone } from "@/lib/status-tone";
import type { LiveRoundState } from "@/lib/waking-night/rounds";

/**
 * Format a Date as its *server-local* calendar date. Never use `toISOString()`
 * for this — it converts to UTC first. Prefer `localDate(now, tz)` from
 * `@/lib/site-time` for anything that must follow the site's timezone; this
 * stays for the eMAR and report code that hasn't moved over yet.
 */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * How a stored round status renders (round detail header). `scheduled` is a
 * pre-created row nobody has checked in to yet.
 */
export const ROUND_STATUS_META: Record<
  NightCheckRoundStatusValue,
  { tone: StatusTone; label: string }
> = {
  scheduled: { tone: "neutral", label: "Scheduled" },
  in_progress: { tone: "info", label: "In progress" },
  complete: { tone: "success", label: "Complete" },
  missed: { tone: "danger", label: "Missed" },
};

/**
 * The single source of truth for how a round's *live* state renders — the
 * tonight list, the 7-night grid and the waking-night timeline all use it.
 * `in_progress` is `info` (teal), not `warning`, so it reads distinctly from
 * "due" (not started).
 */
export const ROUND_STATE_META: Record<LiveRoundState, { tone: StatusTone; label: string }> = {
  scheduled: { tone: "neutral", label: "Not due yet" },
  due: { tone: "warning", label: "Due now" },
  overdue: { tone: "warning", label: "Overdue" },
  in_progress: { tone: "info", label: "In progress" },
  on_time: { tone: "success", label: "On time" },
  late: { tone: "warning", label: "Late" },
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
 * manager-configurable yet.
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

export const ALL_FLOORS: number[] = FLOORS.map((f) => f.floor);

export function isValidRoomNumber(n: number): boolean {
  return roomFloor(n) !== null;
}
