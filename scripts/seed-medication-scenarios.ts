/**
 * Rich eMAR demo/test data - every scenario worth eyeballing in the UI:
 * OD / BD / TDS / QDS rounds, a weekly (partial daysOfWeek) schedule,
 * controlled drugs both scheduled and PRN, PRN with and without safety
 * limits, an archived/discontinued medication, an on-leave resident's
 * medication (should never appear in the live round pages), a resident
 * with no medications at all, and administration history spread across
 * the last week with every outcome (given / refused / omitted /
 * not_available / self_admin) at realistic, jittered times of day.
 *
 * Today's rounds are only backfilled for windows that have already
 * closed, and even then only ~65% of them - so there's always a live
 * "due" / "missed" mix and an open round left for a staff member to
 * actually record in the browser. Two PRN scenarios are seeded
 * deliberately (not randomly) so the safety-warning banners are live
 * right now: a min-interval warning and a max-dose warning.
 *
 * Requires seed:residents, seed:handovers (test staff) and
 * seed:medication (reason codes + the original 4 medications) to have
 * been run first. Safe to re-run - checks before inserting.
 *
 *   npm run seed:medication-scenarios
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  medicationAdministrations,
  medicationReasonCodes,
  medicationSchedules,
  medications,
  residents,
  staff,
} from "../src/db/schema";
import {
  MEDICATION_ROUNDS,
  dayCode,
  isRoundWindowClosed,
  isoDate,
  medicationRoundScheduledAt,
  type MedicationRound,
} from "../src/lib/medication";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function chance(p: number): boolean {
  return Math.random() < p;
}
function jitteredTime(base: Date, maxMinutes: number): Date {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + Math.floor(Math.random() * Math.max(1, maxMinutes)));
  return d;
}

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type RoundSeed = { round: MedicationRound; daysOfWeek?: string[] };

type MedSeed = {
  residentName: string;
  name: string;
  form?: string;
  strength?: string;
  route?: string;
  directions?: string;
  prescriber?: string;
  isControlledDrug?: boolean;
  isPrn?: boolean;
  prnMaxDosePerDay?: number;
  prnMinIntervalMinutes?: number;
  prnReason?: string;
  rounds?: RoundSeed[];
  archived?: boolean;
  startDate?: string;
  endDate?: string;
};

const NEW_MEDS: MedSeed[] = [
  // Aisha Bello - existing Ramipril (OD morning). Add a bedtime med plus two
  // more morning meds, so morning is a 3-medication round for one resident
  // (a clear "multiple medications at one point in time" demo, each signed
  // for individually).
  {
    residentName: "Aisha Bello",
    name: "Atorvastatin",
    form: "Tablet",
    strength: "20mg",
    route: "Oral",
    directions: "Take at night",
    prescriber: "Dr. Osei",
    rounds: [{ round: "bedtime" }],
  },
  {
    residentName: "Aisha Bello",
    name: "Calcium/Vitamin D3",
    form: "Chewable tablet",
    strength: "500mg/400IU",
    route: "Oral",
    directions: "Take with breakfast",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Aisha Bello",
    name: "Metformin",
    form: "Tablet",
    strength: "500mg",
    route: "Oral",
    directions: "Take with breakfast",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },

  // Tom Fletcher - existing Furosemide (BD). Add an unconstrained PRN (no max/interval).
  {
    residentName: "Tom Fletcher",
    name: "Ibuprofen Gel",
    form: "Topical gel",
    strength: "5%",
    route: "Topical",
    directions: "Apply to affected joint as needed",
    prescriber: "Dr. Osei",
    isPrn: true,
    prnReason: "Joint pain",
  },

  // Priya Nair - weekly medication, Monday only. Exercises daysOfWeek filtering.
  {
    residentName: "Priya Nair",
    name: "Alendronic Acid",
    form: "Tablet",
    strength: "70mg",
    route: "Oral",
    directions: "Take on an empty stomach with water, remain upright 30 min. Once weekly - Monday.",
    prescriber: "Dr. Patel",
    rounds: [{ round: "morning", daysOfWeek: ["mon"] }],
  },

  // George Owusu - on_leave resident. Edge case: an active scheduled medication
  // that must NOT appear on the live round pages while the resident is away.
  {
    residentName: "George Owusu",
    name: "Metformin",
    form: "Tablet",
    strength: "500mg",
    route: "Oral",
    directions: "Take with food",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }, { round: "teatime" }],
  },

  // Margaret Hughes - existing Paracetamol PRN. Add a regular bedtime med and a
  // controlled-drug PRN (tests the CD witness flow on a PRN dose, not just scheduled).
  {
    residentName: "Margaret Hughes",
    name: "Donepezil",
    form: "Tablet",
    strength: "5mg",
    route: "Oral",
    directions: "Take at night",
    prescriber: "Dr. Patel",
    rounds: [{ round: "bedtime" }],
  },
  {
    residentName: "Margaret Hughes",
    name: "Lorazepam",
    form: "Tablet",
    strength: "0.5mg",
    route: "Oral",
    directions: "As needed for agitation",
    prescriber: "Dr. Patel",
    isControlledDrug: true,
    isPrn: true,
    prnMaxDosePerDay: 2,
    prnMinIntervalMinutes: 360,
    prnReason: "Agitation / anxiety",
  },

  // Raymond Clarke - existing Morphine CD (BD). Add a bedtime laxative plus
  // three more morning meds, so his morning round stacks up Morphine +
  // three others — a controlled drug alongside ordinary polypharmacy, each
  // one its own signed record.
  {
    residentName: "Raymond Clarke",
    name: "Senna",
    form: "Tablet",
    strength: "7.5mg",
    route: "Oral",
    directions: "Take at night",
    prescriber: "Dr. Patel",
    rounds: [{ round: "bedtime" }],
  },
  {
    residentName: "Raymond Clarke",
    name: "Amlodipine",
    form: "Tablet",
    strength: "5mg",
    route: "Oral",
    directions: "Take in the morning",
    prescriber: "Dr. Patel",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Raymond Clarke",
    name: "Levothyroxine",
    form: "Tablet",
    strength: "100microgram",
    route: "Oral",
    directions: "Take on an empty stomach, 30 min before breakfast",
    prescriber: "Dr. Patel",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Raymond Clarke",
    name: "Omeprazole",
    form: "Capsule",
    strength: "20mg",
    route: "Oral",
    directions: "Take before breakfast",
    prescriber: "Dr. Patel",
    rounds: [{ round: "morning" }],
  },

  // Fatima Khan - simple OD, plus a PRN with genuinely no configured safety limits.
  {
    residentName: "Fatima Khan",
    name: "Amlodipine",
    form: "Tablet",
    strength: "5mg",
    route: "Oral",
    directions: "Take in the morning",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Fatima Khan",
    name: "Salbutamol Inhaler",
    form: "Inhaler",
    strength: "100mcg",
    route: "Inhaled",
    directions: "2 puffs as needed for breathlessness",
    prescriber: "Dr. Osei",
    isPrn: true,
    prnReason: "Breathlessness",
  },

  // Derek Sullivan - OD in the afternoon rather than morning.
  {
    residentName: "Derek Sullivan",
    name: "Warfarin",
    form: "Tablet",
    strength: "3mg",
    route: "Oral",
    directions: "Take as directed - dose per INR record",
    prescriber: "Dr. Patel",
    rounds: [{ round: "teatime" }],
  },

  // Joan Whitfield - QDS, all four rounds due every day. Add two more
  // morning-only meds so morning stacks Co-codamol + two others.
  {
    residentName: "Joan Whitfield",
    name: "Co-codamol",
    form: "Tablet",
    strength: "30/500",
    route: "Oral",
    directions: "Take four times a day",
    prescriber: "Dr. Osei",
    rounds: [
      { round: "morning" },
      { round: "lunchtime" },
      { round: "teatime" },
      { round: "bedtime" },
    ],
  },
  {
    residentName: "Joan Whitfield",
    name: "Levothyroxine",
    form: "Tablet",
    strength: "50microgram",
    route: "Oral",
    directions: "Take on an empty stomach, 30 min before breakfast",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Joan Whitfield",
    name: "Furosemide",
    form: "Tablet",
    strength: "20mg",
    route: "Oral",
    directions: "Take with breakfast",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },

  // Sandra Bryant - TDS, time-limited course (start/end date for display).
  {
    residentName: "Sandra Bryant",
    name: "Co-amoxiclav",
    form: "Tablet",
    strength: "500/125mg",
    route: "Oral",
    directions: "7-day course for wound infection",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }, { round: "lunchtime" }, { round: "teatime" }],
    startDate: "2026-09-12",
    endDate: "2026-09-19",
  },

  // Alan Pearce - simple OD, plus an archived/discontinued PRN (tests the
  // "Show archived" section on the resident page).
  {
    residentName: "Alan Pearce",
    name: "Aspirin",
    form: "Tablet",
    strength: "75mg",
    route: "Oral",
    directions: "Take in the morning",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },
  {
    residentName: "Alan Pearce",
    name: "Tramadol",
    form: "Capsule",
    strength: "50mg",
    route: "Oral",
    directions: "Discontinued - see GP letter",
    prescriber: "Dr. Osei",
    isPrn: true,
    prnMaxDosePerDay: 4,
    prnMinIntervalMinutes: 240,
    prnReason: "Pain relief (discontinued)",
    archived: true,
  },

  // Edith Ramsay - BD regular plus a PRN with limits but no doses seeded today
  // (clean "first dose of the day" flow to try live).
  {
    residentName: "Edith Ramsay",
    name: "Memantine",
    form: "Tablet",
    strength: "10mg",
    route: "Oral",
    directions: "Take morning and night",
    prescriber: "Dr. Patel",
    rounds: [{ round: "morning" }, { round: "bedtime" }],
  },
  {
    residentName: "Edith Ramsay",
    name: "Risperidone",
    form: "Oral liquid",
    strength: "0.5mg",
    route: "Oral",
    directions: "As needed for distress",
    prescriber: "Dr. Patel",
    isPrn: true,
    prnMaxDosePerDay: 2,
    prnMinIntervalMinutes: 480,
    prnReason: "Agitation / distress",
  },

  // Colin Doherty - simple OD morning.
  {
    residentName: "Colin Doherty",
    name: "Sertraline",
    form: "Tablet",
    strength: "50mg",
    route: "Oral",
    directions: "Take in the morning",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },

  // Rita Osei - simple OD, dedicated to exercising the self_admin outcome.
  {
    residentName: "Rita Osei",
    name: "Multivitamin",
    form: "Tablet",
    strength: "1 tablet",
    route: "Oral",
    directions: "Take in the morning - resident self-administers",
    prescriber: "Dr. Osei",
    rounds: [{ round: "morning" }],
  },

  // Michael Adeyemi - deliberately given NO medications: tests the
  // "no scheduled medications" empty state on the resident page.
];

const OUTCOME_REASON: Record<string, string[]> = {
  refused: ["Resident declined", "Resident refused — see notes"],
  omitted: ["Nil by mouth", "Asleep / did not wake", "Nausea / vomiting"],
  not_available: ["Medication not available"],
  self_admin: ["Other — see notes"],
};

function pickOutcome(): "given" | "refused" | "omitted" | "not_available" {
  const r = Math.random();
  if (r < 0.82) return "given";
  if (r < 0.9) return "refused";
  if (r < 0.96) return "omitted";
  return "not_available";
}

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');
  const siteId = site.id;

  const reasonCodes = await db.query.medicationReasonCodes.findMany({
    where: eq(medicationReasonCodes.siteId, siteId),
  });
  if (reasonCodes.length === 0) {
    throw new Error('No reason codes found — run "npm run seed:medication" first.');
  }
  const reasonByLabel = new Map(reasonCodes.filter((r) => r.active).map((r) => [r.label, r.id]));

  const allResidents = await db.query.residents.findMany({ where: eq(residents.siteId, siteId) });
  const residentByName = new Map(
    allResidents.map((r) => [`${r.firstName} ${r.lastName}`.toLowerCase(), r]),
  );

  const allStaff = await db.query.staff.findMany({ where: eq(staff.siteId, siteId) });
  if (allStaff.length < 2) {
    throw new Error('Need at least 2 staff — run "npm run seed:handovers" first.');
  }
  function staffFor(excludeId?: string) {
    const pool = allStaff.filter((s) => s.id !== excludeId);
    return pick(pool.length > 0 ? pool : allStaff);
  }

  /* ---- Insert new medications (idempotent by resident + name) ---- */
  const existingMeds = await db.query.medications.findMany({
    where: eq(medications.siteId, siteId),
    columns: { residentId: true, name: true },
  });
  const haveMedKey = new Set(existingMeds.map((m) => `${m.residentId}|${m.name.toLowerCase()}`));

  let insertedMeds = 0;
  for (const seedMed of NEW_MEDS) {
    const resident = residentByName.get(seedMed.residentName.toLowerCase());
    if (!resident) {
      console.warn(`Skipping "${seedMed.name}" — resident "${seedMed.residentName}" not found.`);
      continue;
    }
    const key = `${resident.id}|${seedMed.name.toLowerCase()}`;
    if (haveMedKey.has(key)) continue;

    const [row] = await db
      .insert(medications)
      .values({
        siteId,
        residentId: resident.id,
        name: seedMed.name,
        form: seedMed.form ?? null,
        strength: seedMed.strength ?? null,
        route: seedMed.route ?? null,
        directions: seedMed.directions ?? null,
        prescriber: seedMed.prescriber ?? null,
        isControlledDrug: seedMed.isControlledDrug ?? false,
        isPrn: seedMed.isPrn ?? false,
        prnMaxDosePerDay: seedMed.prnMaxDosePerDay ?? null,
        prnMinIntervalMinutes: seedMed.prnMinIntervalMinutes ?? null,
        prnReason: seedMed.prnReason ?? null,
        active: !seedMed.archived,
        startDate: seedMed.startDate ?? "2024-01-15",
        endDate: seedMed.endDate ?? null,
      })
      .returning({ id: medications.id });

    if (seedMed.rounds?.length) {
      await db.insert(medicationSchedules).values(
        seedMed.rounds.map((r) => ({
          medicationId: row.id,
          roundSlot: r.round,
          daysOfWeek: r.daysOfWeek ?? ALL_DAYS,
        })),
      );
    }
    insertedMeds++;
  }

  /* ---- Gather every active medication (old + new) for history backfill ---- */
  const scheduledMeds = await db.query.medications.findMany({
    where: and(eq(medications.siteId, siteId), eq(medications.isPrn, false), eq(medications.active, true)),
    with: { schedules: true },
  });
  const prnMeds = await db.query.medications.findMany({
    where: and(eq(medications.siteId, siteId), eq(medications.isPrn, true), eq(medications.active, true)),
  });

  const now = new Date();
  const today = isoDate(now);
  const HISTORY_DAYS = 6;

  function datesBack(n: number): string[] {
    const out: string[] = [];
    for (let i = n; i >= 1; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      out.push(isoDate(d));
    }
    return out;
  }
  const pastDates = datesBack(HISTORY_DAYS);

  const existingAdmins = await db.query.medicationAdministrations.findMany({
    where: and(
      eq(medicationAdministrations.siteId, siteId),
      gte(medicationAdministrations.scheduledDate, pastDates[0]),
      lte(medicationAdministrations.scheduledDate, today),
    ),
    columns: { medicationId: true, scheduledDate: true, scheduledRound: true },
  });
  const haveAdmin = new Set(
    existingAdmins.map((a) => `${a.medicationId}|${a.scheduledDate}|${a.scheduledRound}`),
  );

  const jitterFor: Record<MedicationRound, number> = {
    morning: 25,
    lunchtime: 20,
    teatime: 15,
    bedtime: 25,
  };

  type AdminRow = typeof medicationAdministrations.$inferInsert;
  const toInsert: AdminRow[] = [];

  function buildRow(
    m: (typeof scheduledMeds)[number],
    date: string,
    round: MedicationRound,
    administeredAt: Date,
  ): AdminRow {
    const outcome: "given" | "refused" | "omitted" | "not_available" | "self_admin" =
      m.name === "Multivitamin" ? "self_admin" : pickOutcome();
    const actingStaff = staffFor();
    const witnessStaffId =
      m.isControlledDrug && outcome === "given" ? staffFor(actingStaff.id).id : null;
    const reasonCodeId =
      outcome !== "given" ? (reasonByLabel.get(pick(OUTCOME_REASON[outcome])) ?? null) : null;

    return {
      siteId,
      medicationId: m.id,
      residentId: m.residentId,
      scheduledDate: date,
      scheduledRound: round,
      administeredAt,
      staffId: actingStaff.id,
      outcome,
      reasonCodeId,
      witnessStaffId,
      notes: outcome === "self_admin" ? "Resident self-administers under supervision." : null,
    };
  }

  /* ---- Historical days: fully backfill every due round ---- */
  for (const date of pastDates) {
    const day = dayCode(new Date(`${date}T00:00:00`));
    for (const { round } of MEDICATION_ROUNDS) {
      const scheduledAt = medicationRoundScheduledAt(date, round);
      for (const m of scheduledMeds) {
        const due = m.schedules.some((s) => s.roundSlot === round && s.daysOfWeek.includes(day));
        if (!due) continue;
        const key = `${m.id}|${date}|${round}`;
        if (haveAdmin.has(key)) continue;
        haveAdmin.add(key);
        toInsert.push(buildRow(m, date, round, jitteredTime(scheduledAt, jitterFor[round])));
      }
    }
  }

  /* ---- Today: only rounds already closed, and only ~65% of those - leave
     the rest genuinely missed, and leave open/future rounds untouched so
     there's something live to record in the browser. ---- */
  {
    const day = dayCode(now);
    for (const { round } of MEDICATION_ROUNDS) {
      if (!isRoundWindowClosed(today, round, now)) continue;
      const scheduledAt = medicationRoundScheduledAt(today, round);
      const minutesSinceScheduled = Math.max(
        1,
        Math.floor((now.getTime() - scheduledAt.getTime()) / 60000),
      );
      const cappedJitter = Math.min(jitterFor[round], minutesSinceScheduled);
      for (const m of scheduledMeds) {
        const due = m.schedules.some((s) => s.roundSlot === round && s.daysOfWeek.includes(day));
        if (!due) continue;
        const key = `${m.id}|${today}|${round}`;
        if (haveAdmin.has(key)) continue;
        if (!chance(0.65)) continue;
        haveAdmin.add(key);
        toInsert.push(buildRow(m, today, round, jitteredTime(scheduledAt, cappedJitter)));
      }
    }
  }

  if (toInsert.length > 0) await db.insert(medicationAdministrations).values(toInsert);

  /* ---- PRN history: a couple of doses on a random subset of past days ---- */
  const prnInsert: AdminRow[] = [];
  for (const m of prnMeds) {
    const activeDays = pastDates.filter(() => chance(0.4));
    for (const date of activeDays) {
      const hour = pick([9, 11, 14, 16, 19, 21]);
      const administeredAt = new Date(`${date}T00:00:00`);
      administeredAt.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
      const actingStaff = staffFor();
      const witnessStaffId = m.isControlledDrug ? staffFor(actingStaff.id).id : null;
      prnInsert.push({
        siteId,
        medicationId: m.id,
        residentId: m.residentId,
        scheduledDate: date,
        scheduledRound: null,
        administeredAt,
        staffId: actingStaff.id,
        outcome: "given",
        reasonCodeId: null,
        witnessStaffId,
        prnReasonNow: m.prnReason ?? "As needed",
        prnSafetyWarningAcknowledged: false,
      });
    }
  }
  if (prnInsert.length > 0) await db.insert(medicationAdministrations).values(prnInsert);

  /* ---- Today's live PRN warning scenarios (deliberate, not random) ---- */
  async function seedTodayPrn(medName: string, residentName: string, minutesAgoList: number[]) {
    const resident = residentByName.get(residentName.toLowerCase());
    if (!resident) return;
    const med = await db.query.medications.findFirst({
      where: and(eq(medications.residentId, resident.id), eq(medications.name, medName)),
    });
    if (!med) return;
    const already = await db.query.medicationAdministrations.findFirst({
      where: and(
        eq(medicationAdministrations.medicationId, med.id),
        eq(medicationAdministrations.scheduledDate, today),
      ),
    });
    if (already) return; // already has today's doses from a prior run — leave alone

    for (const minutesAgo of minutesAgoList) {
      const administeredAt = new Date(now.getTime() - minutesAgo * 60000);
      const actingStaff = staffFor();
      const witnessStaffId = med.isControlledDrug ? staffFor(actingStaff.id).id : null;
      await db.insert(medicationAdministrations).values({
        siteId,
        medicationId: med.id,
        residentId: resident.id,
        scheduledDate: today,
        scheduledRound: null,
        administeredAt,
        staffId: actingStaff.id,
        outcome: "given",
        reasonCodeId: null,
        witnessStaffId,
        prnReasonNow: med.prnReason ?? "As needed",
        prnSafetyWarningAcknowledged: false,
      });
    }
  }

  // Paracetamol (max 4/day, min interval 240min): one dose 45 min ago -
  // trying again now live-triggers the MIN-INTERVAL warning.
  await seedTodayPrn("Paracetamol", "Margaret Hughes", [45]);

  // Lorazepam CD PRN (max 2/day, min interval 360min): two doses both well
  // outside the interval, so a 3rd attempt live-triggers the MAX-DOSE warning.
  await seedTodayPrn("Lorazepam", "Margaret Hughes", [600, 380]);

  // Fatima Khan's Salbutamol (no limits) and Edith Ramsay's Risperidone
  // (limits, but zero doses today) are left untouched - a clean "first PRN
  // dose of the day" flow with no warning, to try live.

  console.log(`Inserted ${insertedMeds} new medication(s).`);
  console.log(`Inserted ${toInsert.length} scheduled administration(s) (history + today).`);
  console.log(`Inserted ${prnInsert.length} historical PRN administration(s).`);
  console.log(
    `Live PRN scenarios ready: Margaret Hughes' Paracetamol (min-interval warning) and Lorazepam (max-dose warning).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
