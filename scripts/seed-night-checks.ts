/**
 * Seed the first site with a default night-check checklist and welfare
 * situation list (idempotent — inserts only what's missing, preserving
 * existing order; also backfills `kind` on an already-seeded "Resident
 * welfare" row from before that column existed).
 *
 *   npm run seed:night-checks
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "../src/db";
import { nightCheckSituationTypes, nightCheckTemplateItems } from "../src/db/schema";

const ITEMS = [
  { area: "Front door", description: "Locked and alarm set" },
  { area: "Fire exits", description: "Clear of obstructions and closed" },
  { area: "Kitchen", description: "Appliances off, no hazards left out" },
  { area: "Communal lounge", description: "Tidy, nothing left as a trip hazard" },
  { area: "Corridors", description: "Lighting working, nothing blocking access" },
  { area: "Smoke alarms", description: "Lights showing, no fault beeps" },
  { area: "External gate", description: "Locked" },
  {
    area: "Resident welfare",
    description: "Quiet check each resident is settled — knock only if needed",
    kind: "resident_welfare" as const,
  },
  { area: "Temperature", description: "Building comfortably heated, no reported issues" },
  { area: "Visitors log", description: "No unexpected visitors or vehicles outside" },
];

const SITUATION_TYPES = ["Noise", "Loud music playing", "Shouting", "Banging on doors"];

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');

  const existing = await db.query.nightCheckTemplateItems.findMany({
    where: eq(nightCheckTemplateItems.siteId, site.id),
    orderBy: [asc(nightCheckTemplateItems.sortOrder)],
    columns: { area: true, sortOrder: true },
  });
  const have = new Set(existing.map((i) => i.area.toLowerCase()));
  let nextOrder = existing.length
    ? Math.max(...existing.map((i) => i.sortOrder)) + 1
    : 0;

  const rows = ITEMS.filter((i) => !have.has(i.area.toLowerCase())).map(
    (i) => ({
      siteId: site.id,
      area: i.area,
      description: i.description,
      kind: i.kind ?? ("simple" as const),
      sortOrder: nextOrder++,
    }),
  );

  if (rows.length > 0) await db.insert(nightCheckTemplateItems).values(rows);

  // Backfill: a "Resident welfare" row seeded before `kind` existed won't
  // have been touched by the insert-missing logic above (it already exists).
  await db
    .update(nightCheckTemplateItems)
    .set({ kind: "resident_welfare", updatedAt: new Date() })
    .where(
      and(
        eq(nightCheckTemplateItems.siteId, site.id),
        eq(nightCheckTemplateItems.area, "Resident welfare"),
        ne(nightCheckTemplateItems.kind, "resident_welfare"),
      ),
    );

  const existingSituations = await db.query.nightCheckSituationTypes.findMany({
    where: eq(nightCheckSituationTypes.siteId, site.id),
    orderBy: [asc(nightCheckSituationTypes.sortOrder)],
    columns: { label: true, sortOrder: true },
  });
  const haveSituations = new Set(existingSituations.map((s) => s.label.toLowerCase()));
  let nextSituationOrder = existingSituations.length
    ? Math.max(...existingSituations.map((s) => s.sortOrder)) + 1
    : 0;

  const situationRows = SITUATION_TYPES.filter(
    (label) => !haveSituations.has(label.toLowerCase()),
  ).map((label) => ({
    siteId: site.id,
    label,
    sortOrder: nextSituationOrder++,
  }));

  if (situationRows.length > 0) {
    await db.insert(nightCheckSituationTypes).values(situationRows);
  }

  const total = await db.$count(
    nightCheckTemplateItems,
    eq(nightCheckTemplateItems.siteId, site.id),
  );
  const totalSituations = await db.$count(
    nightCheckSituationTypes,
    eq(nightCheckSituationTypes.siteId, site.id),
  );
  console.log(
    `✓ Inserted ${rows.length} checklist item(s). "${site.name}" now has ${total}.`,
  );
  console.log(
    `✓ Inserted ${situationRows.length} welfare situation type(s). "${site.name}" now has ${totalSituations}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
