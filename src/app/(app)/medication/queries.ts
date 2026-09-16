import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { medicationAdministrations, medications, type MedicationOutcomeValue } from "@/db/schema";
import {
  MEDICATION_ROUNDS,
  dayCode,
  isRoundWindowClosed,
  isoDate,
  type MedicationRound,
} from "@/lib/medication";

export type DueDose = {
  medicationId: string;
  medicationName: string;
  form: string | null;
  strength: string | null;
  isControlledDrug: boolean;
  residentId: string;
  residentName: string;
  administration: {
    id: string;
    outcome: MedicationOutcomeValue;
    administeredAt: Date;
    staffName: string;
  } | null;
};

/** Every active resident's medications due for a given round today, with today's recorded outcome if any. */
export async function dueDosesForRound(
  siteId: string,
  round: MedicationRound,
  now: Date,
): Promise<DueDose[]> {
  const today = isoDate(now);
  const day = dayCode(now);
  const db = getDb();

  const meds = await db.query.medications.findMany({
    where: and(
      eq(medications.siteId, siteId),
      eq(medications.active, true),
      eq(medications.isPrn, false),
    ),
    with: {
      schedules: true,
      resident: {
        columns: { id: true, firstName: true, lastName: true, preferredName: true, status: true },
      },
    },
  });

  const dueMeds = meds.filter(
    (m) =>
      m.resident.status === "active" &&
      m.schedules.some((s) => s.roundSlot === round && s.daysOfWeek.includes(day)),
  );

  const administrations = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.siteId, siteId),
      eq(medicationAdministrations.scheduledDate, today),
      eq(medicationAdministrations.scheduledRound, round),
    ),
    with: { staff: { columns: { name: true } } },
  });
  const byMedicationId = new Map(administrations.map((a) => [a.medicationId, a]));

  return dueMeds
    .map((m) => {
      const admin = byMedicationId.get(m.id);
      return {
        medicationId: m.id,
        medicationName: m.name,
        form: m.form,
        strength: m.strength,
        isControlledDrug: m.isControlledDrug,
        residentId: m.residentId,
        residentName: `${m.resident.preferredName ?? m.resident.firstName} ${m.resident.lastName}`,
        administration: admin
          ? {
              id: admin.id,
              outcome: admin.outcome,
              administeredAt: admin.administeredAt,
              staffName: admin.staff.name,
            }
          : null,
      };
    })
    .sort((a, b) => a.residentName.localeCompare(b.residentName));
}

/* -------------------------------------------------------------------- */
/* Manager reports                                                       */
/* -------------------------------------------------------------------- */

function datesBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  while (d <= end) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export type MissedDose = {
  date: string;
  round: MedicationRound;
  medicationId: string;
  medicationName: string;
  residentId: string;
  residentName: string;
};

/** Scheduled doses with no matching administration row, for rounds whose window has already closed. */
export async function missedDosesInRange(
  siteId: string,
  fromIso: string,
  toIso: string,
  now: Date,
): Promise<MissedDose[]> {
  const db = getDb();

  const meds = await db.query.medications.findMany({
    where: and(eq(medications.siteId, siteId), eq(medications.isPrn, false)),
    with: {
      schedules: true,
      resident: {
        columns: { id: true, firstName: true, lastName: true, preferredName: true },
      },
    },
  });

  const administrations = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.siteId, siteId),
      gte(medicationAdministrations.scheduledDate, fromIso),
      lte(medicationAdministrations.scheduledDate, toIso),
    ),
    columns: { medicationId: true, scheduledDate: true, scheduledRound: true },
  });
  const recorded = new Set(
    administrations.map((a) => `${a.medicationId}|${a.scheduledDate}|${a.scheduledRound}`),
  );

  const missed: MissedDose[] = [];
  for (const date of datesBetween(fromIso, toIso)) {
    const day = dayCode(new Date(`${date}T00:00:00`));
    for (const { round } of MEDICATION_ROUNDS) {
      if (!isRoundWindowClosed(date, round, now)) continue;
      for (const m of meds) {
        const due = m.schedules.some((s) => s.roundSlot === round && s.daysOfWeek.includes(day));
        if (!due) continue;
        if (recorded.has(`${m.id}|${date}|${round}`)) continue;
        missed.push({
          date,
          round,
          medicationId: m.id,
          medicationName: m.name,
          residentId: m.residentId,
          residentName: `${m.resident.preferredName ?? m.resident.firstName} ${m.resident.lastName}`,
        });
      }
    }
  }
  return missed.sort((a, b) => (a.date + a.round).localeCompare(b.date + b.round));
}

export type AdministrationReportRow = {
  id: string;
  scheduledDate: string;
  scheduledRound: string | null;
  outcome: MedicationOutcomeValue;
  medicationId: string;
  medicationName: string;
  isControlledDrug: boolean;
  residentId: string;
  residentName: string;
  staffName: string;
  witnessName: string | null;
  reasonLabel: string | null;
  notes: string | null;
}

async function administrationsInRange(
  siteId: string,
  fromIso: string,
  toIso: string,
  opts: { outcome?: MedicationOutcomeValue; controlledOnly?: boolean; residentId?: string } = {},
): Promise<AdministrationReportRow[]> {
  const db = getDb();
  const rows = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.siteId, siteId),
      gte(medicationAdministrations.scheduledDate, fromIso),
      lte(medicationAdministrations.scheduledDate, toIso),
      opts.outcome ? eq(medicationAdministrations.outcome, opts.outcome) : undefined,
      opts.residentId ? eq(medicationAdministrations.residentId, opts.residentId) : undefined,
    ),
    with: {
      medication: { columns: { name: true, isControlledDrug: true } },
      resident: { columns: { firstName: true, lastName: true, preferredName: true } },
      staff: { columns: { name: true } },
      witness: { columns: { name: true } },
      reasonCode: { columns: { label: true } },
    },
    orderBy: (t, { desc }) => [desc(t.administeredAt)],
  });

  return rows
    .filter((r) => !opts.controlledOnly || r.medication.isControlledDrug)
    .map((r) => ({
      id: r.id,
      scheduledDate: r.scheduledDate,
      scheduledRound: r.scheduledRound,
      outcome: r.outcome,
      medicationId: r.medicationId,
      medicationName: r.medication.name,
      isControlledDrug: r.medication.isControlledDrug,
      residentId: r.residentId,
      residentName: `${r.resident.preferredName ?? r.resident.firstName} ${r.resident.lastName}`,
      staffName: r.staff.name,
      witnessName: r.witness?.name ?? null,
      reasonLabel: r.reasonCode?.label ?? null,
      notes: r.notes,
    }));
}

export function refusalsInRange(siteId: string, fromIso: string, toIso: string, residentId?: string) {
  return administrationsInRange(siteId, fromIso, toIso, { outcome: "refused", residentId });
}

export function cdRegisterInRange(siteId: string, fromIso: string, toIso: string, residentId?: string) {
  return administrationsInRange(siteId, fromIso, toIso, { controlledOnly: true, residentId });
}

export async function reasonTrends(siteId: string, fromIso: string, toIso: string) {
  const rows = await administrationsInRange(siteId, fromIso, toIso);
  const nonGiven = rows.filter((r) => r.outcome !== "given");
  const byReason = new Map<string, number>();
  const byMedication = new Map<string, number>();
  for (const r of nonGiven) {
    const reasonKey = r.reasonLabel ?? "No reason given";
    byReason.set(reasonKey, (byReason.get(reasonKey) ?? 0) + 1);
    byMedication.set(r.medicationName, (byMedication.get(r.medicationName) ?? 0) + 1);
  }
  return {
    byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]),
    byMedication: [...byMedication.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export { administrationsInRange };

export type PrnDoseToday = {
  id: string;
  outcome: MedicationOutcomeValue;
  administeredAt: Date;
  staffName: string;
  prnReasonNow: string | null;
  prnEffectNote: string | null;
};

export type PrnMedication = {
  medicationId: string;
  medicationName: string;
  form: string | null;
  strength: string | null;
  isControlledDrug: boolean;
  prnReason: string | null;
  prnMaxDosePerDay: number | null;
  prnMinIntervalMinutes: number | null;
  residentId: string;
  residentName: string;
  dosesToday: PrnDoseToday[];
};

/** Every active resident's active PRN medications, with today's recorded doses. */
export async function prnMedications(siteId: string, now: Date): Promise<PrnMedication[]> {
  const today = isoDate(now);
  const db = getDb();

  const meds = await db.query.medications.findMany({
    where: and(
      eq(medications.siteId, siteId),
      eq(medications.active, true),
      eq(medications.isPrn, true),
    ),
    with: {
      resident: {
        columns: { id: true, firstName: true, lastName: true, preferredName: true, status: true },
      },
    },
  });
  const active = meds.filter((m) => m.resident.status === "active");

  const administrations = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.siteId, siteId),
      eq(medicationAdministrations.scheduledDate, today),
    ),
    with: { staff: { columns: { name: true } } },
  });
  const byMedicationId = new Map<string, typeof administrations>();
  for (const a of administrations) {
    const list = byMedicationId.get(a.medicationId) ?? [];
    list.push(a);
    byMedicationId.set(a.medicationId, list);
  }

  return active
    .map((m) => ({
      medicationId: m.id,
      medicationName: m.name,
      form: m.form,
      strength: m.strength,
      isControlledDrug: m.isControlledDrug,
      prnReason: m.prnReason,
      prnMaxDosePerDay: m.prnMaxDosePerDay,
      prnMinIntervalMinutes: m.prnMinIntervalMinutes,
      residentId: m.residentId,
      residentName: `${m.resident.preferredName ?? m.resident.firstName} ${m.resident.lastName}`,
      dosesToday: (byMedicationId.get(m.id) ?? [])
        .map((a) => ({
          id: a.id,
          outcome: a.outcome,
          administeredAt: a.administeredAt,
          staffName: a.staff.name,
          prnReasonNow: a.prnReasonNow,
          prnEffectNote: a.prnEffectNote,
        }))
        .sort((a, b) => b.administeredAt.getTime() - a.administeredAt.getTime()),
    }))
    .sort((a, b) => a.residentName.localeCompare(b.residentName));
}
