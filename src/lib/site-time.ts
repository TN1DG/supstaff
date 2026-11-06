/**
 * Night-shift calendar helpers keyed on `sites.timezone` (an IANA name such
 * as "Europe/London"). Vercel runs in UTC, so anything that decides "on time"
 * or "which night" must go through these rather than `Date#getHours()`.
 * Wall-clock conversion itself lives in `zoned-time.ts`.
 *
 * Calendar dates are plain `YYYY-MM-DD` strings throughout, matching the
 * Postgres `date` columns.
 */
import { addDays, instantAt, wallParts, zonedDate } from "@/lib/zoned-time";

export const DEFAULT_TIMEZONE = "Europe/London";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Which night `instant` belongs to, as the evening's calendar date — the date
 * stored in `check_date` / `shift_date`. Anything before local noon counts as
 * the previous evening's night.
 */
export function nightOf(instant: Date, tz: string): string {
  const today = zonedDate(instant, tz);
  return wallParts(instant, tz).hour < 12 ? addDays(today, -1) : today;
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
  return instantAt(isMorningSlot(time) ? addDays(night, 1) : night, time, tz);
}

/** Wall-clock "HH:MM" of `instant` in `tz`. */
export function localTime(instant: Date, tz: string): string {
  const p = wallParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
