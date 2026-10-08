/**
 * Timezone-aware date helpers keyed on `sites.timezone` (an IANA name such as
 * "Europe/London"). Vercel runs in UTC, so anything that decides "on time" or
 * "which night" must go through these rather than `Date#getHours()` — the
 * server-local helpers in `night-checks.ts` are an hour out all summer.
 *
 * Calendar dates are plain `YYYY-MM-DD` strings throughout, matching the
 * Postgres `date` columns.
 */

export const DEFAULT_TIMEZONE = "Europe/London";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = partsFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFormatters.set(tz, fmt);
  }
  return fmt;
}

/** The wall-clock fields of `instant` as seen in `tz`. */
export function zonedParts(instant: Date, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The calendar date of `instant` in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `date` plus `days` calendar days (timezone-free string arithmetic). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Offset of `tz` from UTC at `instant`, in milliseconds (BST → +3_600_000). */
function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` reads `date` `HH:MM`. Two
 * passes so a guess that lands on the other side of a DST change corrects
 * itself; a time inside the spring-forward gap resolves to the hour after.
 */
export function zonedDateTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let guess = wall - offsetMs(new Date(wall), tz);
  guess = wall - offsetMs(new Date(guess), tz);
  return new Date(guess);
}

/**
 * Which night `instant` belongs to, as the evening's calendar date — the date
 * stored in `check_date` / `shift_date`. Anything before local noon counts as
 * the previous evening's night.
 */
export function nightOf(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  const today = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < 12 ? addDays(today, -1) : today;
}

/** True for a slot after midnight (00:00–11:59), which belongs to the next calendar day. */
export function isMorningSlot(time: string): boolean {
  return Number(time.split(":")[0]) < 12;
}

/**
 * When a night slot actually happens: `night` is the evening's date, so the
 * 01:00–07:00 slots land on the following calendar day.
 */
export function nightSlotAt(night: string, time: string, tz: string): Date {
  return zonedDateTime(isMorningSlot(time) ? addDays(night, 1) : night, time, tz);
}

/** Wall-clock "HH:MM" of `instant` in `tz`. */
export function localTime(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
