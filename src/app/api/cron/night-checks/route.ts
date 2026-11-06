import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nightCheckRounds } from "@/db/schema";
import { authorizeCron } from "@/lib/cron";
import { writeAudit } from "@/lib/audit";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf } from "@/lib/site-time";
import { loadNightRounds } from "@/lib/waking-night/round-store";

export const dynamic = "force-dynamic";

/**
 * Sweeps last night's rounds and puts every one that ran past its cutoff
 * without being completed on record as missed, for the manager's compliance
 * report. Runs once daily (Hobby cron limit) after the last round's window
 * closes; `nightOf` resolves to "last night" for any run before local noon.
 * Pages and sign-off compute the same verdict live, so this is a backstop.
 *
 * - no row at all → insert a `missed` row
 * - `scheduled` row → status `missed`
 * - `in_progress` row (checked in, never completed) → keeps its status and
 *   checklist, but `timeliness` becomes `missed`
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const db = getDb();
  const now = new Date();
  const allSites = await db.query.sites.findMany({ columns: { id: true } });

  let swept = 0;
  const nights: Record<string, string> = {};
  for (const site of allSites) {
    const config = await getSiteConfig(site.id);
    const checkDate = nightOf(now, config.timezone);
    nights[site.id] = checkDate;
    const rounds = await loadNightRounds(site.id, checkDate, config, now);

    for (const slot of rounds) {
      if (slot.state !== "missed") continue;
      const row = slot.row;
      if (row && (row.status === "missed" || row.timeliness === "missed")) continue;

      await db.transaction(async (tx) => {
        let id: string;
        if (!row) {
          const [inserted] = await tx
            .insert(nightCheckRounds)
            .values({
              siteId: site.id,
              checkDate,
              roundTime: slot.roundTime,
              scheduledAt: slot.scheduledAt,
              status: "missed",
              timeliness: "missed",
            })
            .onConflictDoNothing()
            .returning({ id: nightCheckRounds.id });
          if (!inserted) return;
          id = inserted.id;
        } else {
          await tx
            .update(nightCheckRounds)
            .set({
              timeliness: "missed",
              ...(row.status === "scheduled" ? { status: "missed" as const } : {}),
              updatedAt: now,
            })
            .where(and(eq(nightCheckRounds.id, row.id), eq(nightCheckRounds.status, row.status)));
          id = row.id;
        }
        await writeAudit(tx, {
          siteId: site.id,
          actorName: "System (cron)",
          action: "night_check.auto_missed",
          entityType: "night_check_round",
          entityId: id,
          after: { checkDate, roundTime: slot.roundTime },
        });
        swept++;
      });
    }
  }

  return NextResponse.json({ ok: true, nights, sitesSwept: allSites.length, swept });
}
