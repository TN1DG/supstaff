import { and, desc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { handovers, outbox } from "@/db/schema";
import { dueDosesForRound } from "@/app/(app)/medication/queries";
import { MEDICATION_ROUNDS, isMedicationRound, roundLabel } from "@/lib/medication";
import type { SiteConfig } from "@/lib/site-settings";
import { zonedDateTime } from "@/lib/site-time";
import type { ShiftSnapshot } from "@/lib/waking-night/auto-items";
import type { NightRound, StoredRoundLike } from "@/lib/waking-night/rounds";

/**
 * Gather what the auto checklist items are decided from. The rules
 * themselves are in `auto-items.ts`; this only queries.
 */
export async function loadShiftSnapshot(
  params: {
    siteId: string;
    night: string;
    config: SiteConfig;
    now: Date;
    rounds: NightRound<StoredRoundLike & { staffId: string | null; completedByStaffId: string | null }>[];
    /** Shift starter + anyone who resolved a checklist item. */
    shiftStaffIds: string[];
    events?: ShiftSnapshot["events"];
    emailFollowUps?: ShiftSnapshot["emailFollowUps"];
  },
  db: DbOrTx = getDb(),
): Promise<ShiftSnapshot> {
  const { siteId, night, config, now, rounds } = params;
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  });

  const findHandover = (shift: "late" | "night") =>
    db.query.handovers.findFirst({
      where: and(
        eq(handovers.siteId, siteId),
        eq(handovers.handoverDate, night),
        eq(handovers.shift, shift),
      ),
      columns: { id: true, status: true, submittedAt: true },
      with: {
        submittedBy: { columns: { name: true } },
        acknowledgements: {
          columns: { staffId: true, readAt: true },
          with: { staff: { columns: { name: true } } },
        },
      },
    });

  const medRounds = config.eveningMedRounds.filter(isMedicationRound);
  const [late, nightHandover, doseLists] = await Promise.all([
    findHandover("late"),
    findHandover("night"),
    Promise.all(medRounds.map((r) => dueDosesForRound(siteId, r, now, night))),
  ]);

  const salesforce = nightHandover
    ? await db.query.outbox.findFirst({
        where: and(
          eq(outbox.entityType, "handover"),
          eq(outbox.entityId, nightHandover.id),
          eq(outbox.target, "salesforce"),
        ),
        orderBy: [desc(outbox.createdAt)],
        columns: { status: true },
      })
    : null;

  // A dose with no record is missed once its round's window has closed
  // (the next round's time, or two hours after the last), in site time.
  const windowClosed = (round: string) => {
    const idx = MEDICATION_ROUNDS.findIndex((r) => r.round === round);
    const next = MEDICATION_ROUNDS[idx + 1];
    const end = next
      ? zonedDateTime(night, next.time, config.timezone)
      : new Date(zonedDateTime(night, MEDICATION_ROUNDS[idx].time, config.timezone).getTime() + 2 * 3_600_000);
    return now >= end;
  };

  const nightStaffIds = new Set(params.shiftStaffIds);
  for (const r of rounds) {
    if (r.row?.staffId) nightStaffIds.add(r.row.staffId);
    if (r.row?.completedByStaffId) nightStaffIds.add(r.row.completedByStaffId);
  }

  return {
    nightStaffIds: [...nightStaffIds],
    lateHandover: late
      ? {
          id: late.id,
          status: late.status,
          acknowledgements: late.acknowledgements.map((a) => ({
            staffId: a.staffId,
            staffName: a.staff.name,
            readAtLabel: timeFmt.format(a.readAt),
          })),
        }
      : null,
    nightHandover: nightHandover
      ? {
          id: nightHandover.id,
          status: nightHandover.status,
          submittedAtLabel: nightHandover.submittedAt ? timeFmt.format(nightHandover.submittedAt) : null,
          submittedByName: nightHandover.submittedBy?.name ?? null,
          salesforceStatus: salesforce?.status ?? null,
        }
      : null,
    eveningMeds: {
      rounds: medRounds.map(roundLabel),
      doses: medRounds.flatMap((round, i) =>
        doseLists[i].map((d) => ({
          residentName: d.residentName,
          medicationName: d.medicationName,
          roundLabel: roundLabel(round),
          outcome: d.administration?.outcome ?? null,
          missed: !d.administration && windowClosed(round),
        })),
      ),
    },
    rounds: rounds.map((r) => ({
      roundTime: r.roundTime,
      timeliness: r.timeliness,
      reasonMissing: r.reasonMissing,
    })),
    events: params.events ?? [],
    emailFollowUps: params.emailFollowUps ?? [],
  };
}
