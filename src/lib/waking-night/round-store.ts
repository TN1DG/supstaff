import { and, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import {
  nightCheckItemResults,
  nightCheckRoomChecks,
  nightCheckRounds,
  nightCheckTemplateItems,
} from "@/db/schema";
import { ALL_ROOM_NUMBERS } from "@/lib/night-checks";
import type { SiteConfig } from "@/lib/site-settings";
import { buildRoundSchedule, mergeNightRounds } from "@/lib/waking-night/rounds";

/**
 * Database side of welfare rounds — shared by the night-checks pages, the
 * waking-night shift page, the sweep cron and sign-off.
 */

/** Tonight's rounds (rows + staff names) merged with the schedule. */
export async function loadNightRounds(
  siteId: string,
  night: string,
  config: SiteConfig,
  now: Date,
  db: DbOrTx = getDb(),
) {
  const rows = await db.query.nightCheckRounds.findMany({
    where: and(eq(nightCheckRounds.siteId, siteId), eq(nightCheckRounds.checkDate, night)),
    with: {
      staff: { columns: { name: true } },
      completedBy: { columns: { name: true } },
    },
  });
  return mergeNightRounds(
    buildRoundSchedule(config.roundTimes, night, config.timezone),
    rows,
    config.roundToleranceMinutes,
    now,
  );
}

/**
 * Create a `scheduled` row for every slot of the night that has none yet.
 * Idempotent: the unique (site, date, time) constraint absorbs re-runs and
 * races.
 */
export async function ensureScheduledRounds(
  tx: DbOrTx,
  siteId: string,
  night: string,
  config: SiteConfig,
): Promise<number> {
  const schedule = buildRoundSchedule(config.roundTimes, night, config.timezone);
  if (schedule.length === 0) return 0;
  const inserted = await tx
    .insert(nightCheckRounds)
    .values(
      schedule.map((slot) => ({
        siteId,
        checkDate: night,
        roundTime: slot.roundTime,
        scheduledAt: slot.scheduledAt,
        status: "scheduled" as const,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: nightCheckRounds.id });
  return inserted.length;
}

/**
 * Give a freshly started round its checklist: one result per active template
 * item and, for the welfare item, one room check per room.
 */
export async function seedRoundContents(
  tx: DbOrTx,
  siteId: string,
  roundId: string,
  now: Date,
) {
  const activeItems = await tx.query.nightCheckTemplateItems.findMany({
    where: and(
      eq(nightCheckTemplateItems.siteId, siteId),
      eq(nightCheckTemplateItems.active, true),
    ),
    columns: { id: true, kind: true },
  });

  if (activeItems.length > 0) {
    await tx
      .insert(nightCheckItemResults)
      .values(
        activeItems.map((it) => ({
          roundId,
          templateItemId: it.id,
          // Silence = OK for the welfare drill-down — no per-room
          // confirmation needed to complete a clean round. Every other
          // item still starts unanswered.
          status: it.kind === "resident_welfare" ? ("ok" as const) : null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  const welfareItem = activeItems.find((it) => it.kind === "resident_welfare");
  if (welfareItem) {
    await tx
      .insert(nightCheckRoomChecks)
      .values(
        ALL_ROOM_NUMBERS.map((roomNumber) => ({
          roundId,
          templateItemId: welfareItem.id,
          roomNumber,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }
}
