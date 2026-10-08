import { eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { siteSettings, sites } from "@/db/schema";
import { DEFAULT_TIMEZONE } from "@/lib/site-time";
import {
  DEFAULT_ROUND_TIMES,
  DEFAULT_TOLERANCE_MINUTES,
  sortNightSlots,
} from "@/lib/waking-night/rounds";

/**
 * A service's configuration with every gap filled from the defaults. Phone
 * numbers default to `null` — nothing is hard-coded; the quick-reference
 * panel only shows numbers a manager has entered.
 */
export type SiteConfig = {
  siteId: string;
  timezone: string;
  roundTimes: string[];
  roundToleranceMinutes: number;
  eveningMedRounds: string[];
  oohRepairsPhone: string | null;
  onCallManagerPhone: string | null;
  emergencyPhone: string | null;
  nhsPhone: string | null;
  policeNonEmergencyPhone: string | null;
  hasLoneWorkerDevice: boolean;
  teamEmail: string | null;
};

export const DEFAULT_EVENING_MED_ROUNDS = ["bedtime"];

export async function getSiteConfig(siteId: string, db: DbOrTx = getDb()): Promise<SiteConfig> {
  const [row] = await db
    .select({ timezone: sites.timezone, settings: siteSettings })
    .from(sites)
    .leftJoin(siteSettings, eq(siteSettings.siteId, sites.id))
    .where(eq(sites.id, siteId))
    .limit(1);
  const s = row?.settings;
  return {
    siteId,
    timezone: row?.timezone || DEFAULT_TIMEZONE,
    roundTimes: sortNightSlots(s?.roundTimes?.length ? s.roundTimes : DEFAULT_ROUND_TIMES),
    roundToleranceMinutes: s?.roundToleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES,
    eveningMedRounds: s?.eveningMedRounds?.length ? s.eveningMedRounds : DEFAULT_EVENING_MED_ROUNDS,
    oohRepairsPhone: s?.oohRepairsPhone ?? null,
    onCallManagerPhone: s?.onCallManagerPhone ?? null,
    emergencyPhone: s?.emergencyPhone ?? null,
    nhsPhone: s?.nhsPhone ?? null,
    policeNonEmergencyPhone: s?.policeNonEmergencyPhone ?? null,
    hasLoneWorkerDevice: s?.hasLoneWorkerDevice ?? false,
    teamEmail: s?.teamEmail ?? null,
  };
}
