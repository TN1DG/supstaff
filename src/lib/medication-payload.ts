import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { medicationAdministrations, medications, residents, sites } from "@/db/schema";
import { dayCode, isoDate } from "@/lib/medication";

export type MarCell = {
  outcome: string;
  staffInitials: string;
  witnessInitials: string | null;
} | null;

export type MarPayload = {
  site: { id: string; name: string };
  resident: { id: string; name: string; room: string | null; dateOfBirth: string | null };
  weekStart: string;
  weekEnd: string;
  days: string[];
  medications: {
    id: string;
    name: string;
    strength: string | null;
    form: string | null;
    isControlledDrug: boolean;
    rounds: string[];
    /** day -> round -> cell (null = not due that day) */
    cells: Record<string, Record<string, MarCell>>;
  }[];
  prn: {
    administeredAt: string;
    medicationName: string;
    outcome: string;
    staffInitials: string;
    reason: string | null;
    effectNote: string | null;
  }[];
  generatedAt: string;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function weekDays(weekStartIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${weekStartIso}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export async function buildMarPayload(
  residentId: string,
  siteId: string,
  weekStartIso: string,
): Promise<MarPayload> {
  const db = getDb();

  const [site, resident] = await Promise.all([
    db.query.sites.findFirst({ where: eq(sites.id, siteId), columns: { id: true, name: true } }),
    db.query.residents.findFirst({
      where: and(eq(residents.id, residentId), eq(residents.siteId, siteId)),
    }),
  ]);
  if (!site || !resident) throw new Error("Not found");

  const days = weekDays(weekStartIso);
  const weekEnd = days[6];

  const meds = await db.query.medications.findMany({
    where: and(eq(medications.residentId, residentId), eq(medications.siteId, siteId)),
    with: { schedules: true },
  });
  const scheduled = meds.filter((m) => !m.isPrn);
  const prnMeds = meds.filter((m) => m.isPrn);

  const administrations = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.residentId, residentId),
      gte(medicationAdministrations.scheduledDate, days[0]),
      lte(medicationAdministrations.scheduledDate, weekEnd),
    ),
    with: {
      staff: { columns: { name: true } },
      witness: { columns: { name: true } },
    },
  });

  const byMedDayRound = new Map<string, (typeof administrations)[number]>();
  const prnRows: typeof administrations = [];
  for (const a of administrations) {
    if (a.scheduledRound) {
      byMedDayRound.set(`${a.medicationId}|${a.scheduledDate}|${a.scheduledRound}`, a);
    } else {
      prnRows.push(a);
    }
  }

  const medicationsOut = scheduled.map((m) => {
    const rounds = [...new Set(m.schedules.map((s) => s.roundSlot))];
    const cells: Record<string, Record<string, MarCell>> = {};
    for (const day of days) {
      cells[day] = {};
      const dow = dayCode(new Date(`${day}T00:00:00`));
      for (const round of rounds) {
        const due = m.schedules.some((s) => s.roundSlot === round && s.daysOfWeek.includes(dow));
        // Only set a key when the dose is actually due that day — leaving it
        // absent (vs. present-but-null) is how the PDF tells "not due" apart
        // from "due but not yet recorded".
        if (!due) continue;
        const admin = byMedDayRound.get(`${m.id}|${day}|${round}`);
        cells[day][round] = admin
          ? {
              outcome: admin.outcome,
              staffInitials: initials(admin.staff.name),
              witnessInitials: admin.witness ? initials(admin.witness.name) : null,
            }
          : null;
      }
    }
    return {
      id: m.id,
      name: m.name,
      strength: m.strength,
      form: m.form,
      isControlledDrug: m.isControlledDrug,
      rounds,
      cells,
    };
  });

  const prnOut = prnRows
    .filter((a) => prnMeds.some((m) => m.id === a.medicationId))
    .sort((a, b) => a.administeredAt.getTime() - b.administeredAt.getTime())
    .map((a) => {
      const med = prnMeds.find((m) => m.id === a.medicationId)!;
      return {
        administeredAt: a.administeredAt.toISOString(),
        medicationName: med.name,
        outcome: a.outcome,
        staffInitials: initials(a.staff.name),
        reason: a.prnReasonNow,
        effectNote: a.prnEffectNote,
      };
    });

  return {
    site: { id: site.id, name: site.name },
    resident: {
      id: resident.id,
      name: `${resident.preferredName ?? resident.firstName} ${resident.lastName}`,
      room: resident.room,
      dateOfBirth: resident.dateOfBirth,
    },
    weekStart: days[0],
    weekEnd,
    days,
    medications: medicationsOut,
    prn: prnOut,
    generatedAt: new Date().toISOString(),
  };
}
