import type { ShiftType } from "@/db/schema";
import { getSiteConfig } from "@/lib/site-settings";
import { localDate, nightOf, zonedParts } from "@/lib/site-time";

/**
 * Which handover `now` belongs to, in the site's timezone: early 07–14,
 * late 14–21, night 21–07. A night handover is dated the evening the shift
 * started (the same date as the waking-night shift and its rounds), so after
 * midnight the night shift still writes into last evening's record.
 */
export function currentHandoverSlot(now: Date, timezone: string): { shift: ShiftType; date: string } {
  const hour = zonedParts(now, timezone).hour;
  if (hour >= 7 && hour < 14) return { shift: "early", date: localDate(now, timezone) };
  if (hour >= 14 && hour < 21) return { shift: "late", date: localDate(now, timezone) };
  return { shift: "night", date: nightOf(now, timezone) };
}

/** Defaults for the "start a handover" form. */
export async function handoverStartDefaults(siteId: string, now = new Date()) {
  const { timezone } = await getSiteConfig(siteId);
  return {
    today: localDate(now, timezone),
    night: nightOf(now, timezone),
    shift: currentHandoverSlot(now, timezone).shift,
  };
}
