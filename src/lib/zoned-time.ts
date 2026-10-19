/**
 * Wall-clock time in a named time zone (the site's, e.g. "Europe/London"),
 * without a date library. Client-safe.
 *
 * Why this exists: the server runs in UTC on Vercel, but staff read and type
 * UK times. Instants are always stored and compared as absolute timestamps;
 * these helpers only convert at the edges — formatting for display and
 * reading a typed "03:10" back into an instant.
 */

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock date and time an instant shows in `timeZone`. */
export function wallParts(instant: Date, timeZone: string): WallParts & { second: number } {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms (BST = +3_600_000). */
function offsetMs(instant: number, timeZone: string): number {
  const p = wallParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which `timeZone`'s clock reads the given wall time.
 *
 * On the night the clocks go back, 01:30 happens twice; this returns the
 * first (BST) one. On the night they go forward, 01:30 never happens; this
 * returns the instant an hour later on the new clock (02:30 BST).
 */
export function zonedToInstant(p: WallParts, timeZone: string): Date {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const HALF_DAY = 12 * 3_600_000;
  // The zone's offset either side of any transition that could touch this day.
  const before = offsetMs(guess - HALF_DAY, timeZone);
  const after = offsetMs(guess + HALF_DAY, timeZone);
  const candidates = [...new Set([guess - before, guess - after])];
  const matching = candidates.filter((c) => {
    const w = wallParts(new Date(c), timeZone);
    return w.day === p.day && w.hour === p.hour && w.minute === p.minute;
  });
  if (matching.length > 0) return new Date(Math.min(...matching));
  // Not a real wall time (the hour skipped when the clocks go forward):
  // read it on the old clock, which lands an hour later on the new one.
  return new Date(guess - before);
}

/** "YYYY-MM-DD" for the wall-clock date of `instant` in `timeZone`. */
export function zonedDate(instant: Date, timeZone: string): string {
  const p = wallParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Add whole calendar days to a "YYYY-MM-DD" string. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The instant for a "YYYY-MM-DD" + "HH:MM" wall time in `timeZone`. */
export function instantAt(isoDate: string, hhmm: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return zonedToInstant({ year, month, day, hour, minute }, timeZone);
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Read a typed "HH:MM" as the most recent time the clock showed it, at or
 * before `now` (plus a minute of slack for clock skew). Night staff type
 * "23:50" at 00:10 and mean last night, not tonight. Returns null for
 * anything that isn't a valid time.
 */
export function mostRecentWallTime(hhmm: string, now: Date, timeZone: string): Date | null {
  if (!HHMM.test(hhmm)) return null;
  const today = zonedDate(now, timeZone);
  const candidate = instantAt(today, hhmm, timeZone);
  if (candidate.getTime() <= now.getTime() + 60_000) return candidate;
  return instantAt(addDays(today, -1), hhmm, timeZone);
}

/**
 * Read a typed "YYYY-MM-DDTHH:MM" (an `<input type="datetime-local">` value)
 * as wall time in `timeZone`. Returns null when malformed.
 */
export function parseLocalDateTime(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedToInstant({ year: y, month: mo, day: d, hour: h, minute: mi }, timeZone);
}

/** The `datetime-local` input value showing `instant` in `timeZone`. */
export function toLocalDateTimeValue(instant: Date, timeZone: string): string {
  const p = wallParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
