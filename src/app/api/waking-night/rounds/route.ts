import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/rbac";
import { loadShiftView } from "@/lib/waking-night/shift-view";

export const dynamic = "force-dynamic";

/**
 * Tonight's round states for the in-app reminder (`RoundReminder`), which
 * polls this while the app is open. Empty unless a shift is open, so nobody
 * gets nagged on a night without a waking-night shift.
 */
export async function GET() {
  const staff = await guardRoute("bank_staff");
  if (staff instanceof Response) return staff;

  const view = await loadShiftView(staff.siteId);
  if (view.shift?.status !== "open") return NextResponse.json({ rounds: [] });

  return NextResponse.json({
    rounds: view.rounds.map((r) => ({
      roundTime: r.roundTime,
      scheduledAt: r.scheduledAt.toISOString(),
      state: r.state,
    })),
  });
}
