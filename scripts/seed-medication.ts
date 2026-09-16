/**
 * Seed the first site with medication reason codes and a handful of sample
 * medications (idempotent — matches on label / resident+name, inserts only
 * what's missing). Requires `npm run seed:residents` to have been run first.
 *
 *   npm run seed:medication
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { medicationReasonCodes, medicationSchedules, medications, residents } from "../src/db/schema";

const REASON_CODES = [
  "Asleep / did not wake",
  "In hospital / at appointment",
  "Resident declined",
  "Nausea / vomiting",
  "Nil by mouth",
  "Medication not available",
  "Resident refused — see notes",
  "Other — see notes",
];

type SeedMed = {
  residentName: string; // "First Last" to match seeded residents
  name: string;
  form: string;
  strength: string;
  route: string;
  directions: string;
  prescriber: string;
  isControlledDrug?: boolean;
  isPrn?: boolean;
  prnMaxDosePerDay?: number;
  prnMinIntervalMinutes?: number;
  prnReason?: string;
  rounds?: string[];
};

const SEED_MEDS: SeedMed[] = [
  {
    residentName: "Aisha Bello",
    name: "Ramipril",
    form: "Tablet",
    strength: "5mg",
    route: "Oral",
    directions: "Take with water in the morning",
    prescriber: "Dr. Osei",
    rounds: ["morning"],
  },
  {
    residentName: "Tom Fletcher",
    name: "Furosemide",
    form: "Tablet",
    strength: "40mg",
    route: "Oral",
    directions: "Take with food",
    prescriber: "Dr. Osei",
    rounds: ["morning", "lunchtime"],
  },
  {
    residentName: "Raymond Clarke",
    name: "Morphine Sulfate MR",
    form: "Tablet",
    strength: "10mg",
    route: "Oral",
    directions: "Swallow whole, do not crush",
    prescriber: "Dr. Patel",
    isControlledDrug: true,
    rounds: ["morning", "bedtime"],
  },
  {
    residentName: "Margaret Hughes",
    name: "Paracetamol",
    form: "Tablet",
    strength: "500mg",
    route: "Oral",
    directions: "1-2 tablets as needed",
    prescriber: "Dr. Osei",
    isPrn: true,
    prnMaxDosePerDay: 4,
    prnMinIntervalMinutes: 240,
    prnReason: "Pain relief",
  },
];

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');

  // --- reason codes ---
  const existingReasons = await db.query.medicationReasonCodes.findMany({
    where: eq(medicationReasonCodes.siteId, site.id),
    orderBy: [asc(medicationReasonCodes.sortOrder)],
    columns: { label: true, sortOrder: true },
  });
  const haveReasons = new Set(existingReasons.map((r) => r.label.toLowerCase()));
  let nextReasonOrder = existingReasons.length
    ? Math.max(...existingReasons.map((r) => r.sortOrder)) + 1
    : 0;
  const reasonRows = REASON_CODES.filter((label) => !haveReasons.has(label.toLowerCase())).map(
    (label) => ({ siteId: site.id, label, sortOrder: nextReasonOrder++ }),
  );
  if (reasonRows.length > 0) await db.insert(medicationReasonCodes).values(reasonRows);

  // --- residents lookup ---
  const allResidents = await db.query.residents.findMany({
    where: eq(residents.siteId, site.id),
    columns: { id: true, firstName: true, lastName: true },
  });
  const residentByName = new Map(
    allResidents.map((r) => [`${r.firstName} ${r.lastName}`.toLowerCase(), r.id]),
  );

  // --- existing medications (match on resident + name) ---
  const existingMeds = await db.query.medications.findMany({
    where: eq(medications.siteId, site.id),
    columns: { residentId: true, name: true },
  });
  const haveMeds = new Set(existingMeds.map((m) => `${m.residentId}|${m.name.toLowerCase()}`));

  let insertedMeds = 0;
  for (const seedMed of SEED_MEDS) {
    const residentId = residentByName.get(seedMed.residentName.toLowerCase());
    if (!residentId) {
      console.warn(`Skipping "${seedMed.name}" — resident "${seedMed.residentName}" not found.`);
      continue;
    }
    if (haveMeds.has(`${residentId}|${seedMed.name.toLowerCase()}`)) continue;

    const [row] = await db
      .insert(medications)
      .values({
        siteId: site.id,
        residentId,
        name: seedMed.name,
        form: seedMed.form,
        strength: seedMed.strength,
        route: seedMed.route,
        directions: seedMed.directions,
        prescriber: seedMed.prescriber,
        isControlledDrug: seedMed.isControlledDrug ?? false,
        isPrn: seedMed.isPrn ?? false,
        prnMaxDosePerDay: seedMed.prnMaxDosePerDay ?? null,
        prnMinIntervalMinutes: seedMed.prnMinIntervalMinutes ?? null,
        prnReason: seedMed.prnReason ?? null,
        startDate: "2024-01-15",
      })
      .returning({ id: medications.id });

    if (seedMed.rounds && seedMed.rounds.length > 0) {
      await db
        .insert(medicationSchedules)
        .values(seedMed.rounds.map((roundSlot) => ({ medicationId: row.id, roundSlot })));
    }
    insertedMeds++;
  }

  const totalReasons = await db.$count(
    medicationReasonCodes,
    eq(medicationReasonCodes.siteId, site.id),
  );
  const totalMeds = await db.$count(medications, and(eq(medications.siteId, site.id)));
  console.log(
    `✓ Inserted ${reasonRows.length} reason code(s). "${site.name}" now has ${totalReasons}.`,
  );
  console.log(`✓ Inserted ${insertedMeds} medication(s). "${site.name}" now has ${totalMeds}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
