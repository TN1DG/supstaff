import type { ShiftType } from "@/db/schema";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf } from "@/lib/site-time";
import { wallParts, zonedDate } from "@/lib/zoned-time";

/**
 * Which handover `now` belongs to, in the site's timezone: early 07–14,
 * late 14–21, night 21–07. A night handover is dated the evening the shift
 * started (the same date as the waking-night shift and its rounds), so after
 * midnight the night shift still writes into last evening's record.
 */
export function currentHandoverSlot(now: Date, timezone: string): { shift: ShiftType; date: string } {
  const hour = wallParts(now, timezone).hour;
  if (hour >= 7 && hour < 14) return { shift: "early", date: zonedDate(now, timezone) };
  if (hour >= 14 && hour < 21) return { shift: "late", date: zonedDate(now, timezone) };
  return { shift: "night", date: nightOf(now, timezone) };
}

/** Defaults for the "start a handover" form. */
export async function handoverStartDefaults(siteId: string, now = new Date()) {
  const { timezone } = await getSiteConfig(siteId);
  return {
    today: zonedDate(now, timezone),
    night: nightOf(now, timezone),
    shift: currentHandoverSlot(now, timezone).shift,
  };
}
