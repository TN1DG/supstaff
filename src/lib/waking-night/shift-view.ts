import { and, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { wakingNightShifts } from "@/db/schema";
import { getSiteConfig } from "@/lib/site-settings";
import { nightOf } from "@/lib/site-time";
import { autoOutcomes } from "@/lib/waking-night/auto-items";
import { evaluateChecklist, type AutoOutcome } from "@/lib/waking-night/checklist";
import { NIGHT_EVENT_META } from "@/lib/waking-night/escalation";
import { loadShiftSnapshot } from "@/lib/waking-night/snapshot";
import { loadNightRounds } from "@/lib/waking-night/round-store";
import { signOffBlockers } from "@/lib/waking-night/sign-off";

/**
 * Everything the waking-night page shows and sign-off enforces, assembled in
 * one place so the two can never disagree. `night` defaults to the night
 * that's current in the site's timezone.
 */
export async function loadShiftView(
  siteId: string,
  opts: { night?: string; now?: Date; db?: DbOrTx } = {},
) {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const config = await getSiteConfig(siteId, db);
  const night = opts.night ?? nightOf(now, config.timezone);

  const [shift, rounds] = await Promise.all([
    db.query.wakingNightShifts.findFirst({
      where: and(eq(wakingNightShifts.siteId, siteId), eq(wakingNightShifts.shiftDate, night)),
      with: {
        startedBy: { columns: { id: true, name: true } },
        signedOffBy: { columns: { name: true } },
        checklistResults: { with: { resolvedBy: { columns: { name: true } } } },
        events: {
          orderBy: (e, { asc }) => [asc(e.occurredAt)],
          with: {
            resident: { columns: { firstName: true, lastName: true, preferredName: true } },
            loggedBy: { columns: { name: true } },
            followUps: {
              orderBy: (f, { asc }) => [asc(f.createdAt)],
              with: { resolvedBy: { columns: { name: true } } },
            },
          },
        },
      },
    }),
    loadNightRounds(siteId, night, config, now, db),
  ]);

  const events = (shift?.events ?? []).map((e) => ({
    ...e,
    label: `${NIGHT_EVENT_META[e.type].label}${
      e.resident ? ` — ${e.resident.preferredName ?? e.resident.firstName} ${e.resident.lastName}` : ""
    }`,
  }));
  const followUps = events.flatMap((e) => e.followUps.map((f) => ({ ...f, eventLabel: e.label })));

  // Auto items are only derived while the shift is open; afterwards the
  // sign-off snapshot is the record.
  let auto: Record<string, AutoOutcome> = {};
  if (shift?.status === "open") {
    const snapshot = await loadShiftSnapshot(
      {
        siteId,
        night,
        config,
        now,
        rounds,
        shiftStaffIds: [
          shift.startedByStaffId,
          ...shift.checklistResults.map((r) => r.resolvedByStaffId),
          ...followUps.map((f) => f.resolvedByStaffId),
          ...events.map((e) => e.loggedByStaffId),
        ].filter((id): id is string => !!id),
        events: events.map((e) => ({ id: e.id, label: e.label, onHandover: !!e.handoverId })),
        emailFollowUps: followUps
          .filter((f) => f.kind === "email_team")
          .map((f) => ({ id: f.id, label: `Email the team — ${f.eventLabel}`, status: f.status })),
      },
      db,
    );
    auto = autoOutcomes(snapshot);
  }

  const items = evaluateChecklist(
    (shift?.checklistResults ?? [])
      // While open, auto items are derived live and only staff answers feed
      // back in; once signed off, the snapshot taken at sign-off is the record.
      .filter((r) => shift?.status === "signed_off" || r.source === "manual")
      .map((r) => ({
        itemKey: r.itemKey,
        status: r.status,
        reason: r.reason,
        source: r.source,
        resolvedByName: r.resolvedBy?.name ?? null,
        resolvedAt: r.resolvedAt,
      })),
    auto,
  );

  const blockers = signOffBlockers({
    items,
    rounds,
    followUps: followUps.map((f) => ({ label: `${f.label} (${f.eventLabel})`, status: f.status })),
  });

  return { config, night, now, shift: shift ?? null, rounds, items, auto, events, followUps, blockers };
}

export type ShiftView = Awaited<ReturnType<typeof loadShiftView>>;
