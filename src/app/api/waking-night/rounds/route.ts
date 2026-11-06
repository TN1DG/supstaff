import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { wakingNightShifts } from "@/db/schema";
import { guardRoute } from "@/lib/rbac";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf } from "@/lib/site-time";
import { loadNightRounds } from "@/lib/waking-night/round-store";

export const dynamic = "force-dynamic";

/**
 * Tonight's round states for the in-app reminder (`RoundReminder`), which
 * polls this while the app is open. Empty unless a shift is open, so nobody
 * gets nagged on a night without a waking-night shift. Deliberately lean —
 * just the shift status and rounds, not the full `loadShiftView`.
 */
export async function GET() {
  const staff = await guardRoute("bank_staff");
  if (staff instanceof Response) return staff;

  const now = new Date();
  const config = await getSiteConfig(staff.siteId);
  const night = nightOf(now, config.timezone);
  const shift = await getDb().query.wakingNightShifts.findFirst({
    where: and(eq(wakingNightShifts.siteId, staff.siteId), eq(wakingNightShifts.shiftDate, night)),
    columns: { status: true },
  });
  if (shift?.status !== "open") return NextResponse.json({ rounds: [] });

  const rounds = await loadNightRounds(staff.siteId, night, config, now);
  return NextResponse.json({
    rounds: rounds.map((r) => ({
      roundTime: r.roundTime,
      scheduledAt: r.scheduledAt.toISOString(),
      state: r.state,
    })),
  });
}
