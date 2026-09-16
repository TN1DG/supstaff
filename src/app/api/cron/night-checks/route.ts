import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nightCheckRounds } from "@/db/schema";
import { authorizeCron } from "@/lib/cron";
import { writeAudit } from "@/lib/audit";
import { ROUND_TIMES, currentNightOf } from "@/lib/night-checks";

export const dynamic = "force-dynamic";

/**
 * Sweeps last night's rounds and records any slot no one checked in for as
 * `missed`, for the manager's compliance report. Runs once daily (Hobby cron
 * limit) shortly after the last round's window closes; `currentNightOf`
 * naturally resolves to "last night" for any run before noon. Protected by
 * CRON_SECRET.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const db = getDb();
  const checkDate = currentNightOf(new Date());
  const allSites = await db.query.sites.findMany({ columns: { id: true } });

  let created = 0;
  for (const site of allSites) {
    const existing = await db.query.nightCheckRounds.findMany({
      where: and(
        eq(nightCheckRounds.siteId, site.id),
        eq(nightCheckRounds.checkDate, checkDate),
      ),
      columns: { roundTime: true },
    });
    const done = new Set(existing.map((r) => r.roundTime));

    for (const roundTime of ROUND_TIMES) {
      if (done.has(roundTime)) continue;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(nightCheckRounds)
          .values({
            siteId: site.id,
            checkDate,
            roundTime,
            status: "missed",
          })
          .returning({ id: nightCheckRounds.id });
        await writeAudit(tx, {
          siteId: site.id,
          actorName: "System (cron)",
          action: "night_check.auto_missed",
          entityType: "night_check_round",
          entityId: row.id,
          after: { checkDate, roundTime },
        });
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, checkDate, sitesSwept: allSites.length, created });
}
