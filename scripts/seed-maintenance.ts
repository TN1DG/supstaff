/**
 * Seed a housing officer account and a spread of demo building reports
 * (idempotent — the officer is skipped if the email exists; reports are only
 * added when the site has none). Seeded reports skip the outbox on purpose:
 * demo data must never be forwarded to Saw-it.
 *
 *   npm run seed:maintenance
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  maintenanceReports,
  maintenanceReportUpdates,
  staff,
  type MaintenanceCategoryValue,
  type MaintenancePriorityValue,
  type MaintenanceStatusValue,
} from "../src/db/schema";
import { generateTempPassword, hashSecret } from "../src/lib/password";

type Demo = {
  title: string;
  location: string;
  roomNumber?: number;
  category: MaintenanceCategoryValue;
  priority: MaintenancePriorityValue;
  status: MaintenanceStatusValue;
  daysAgo: number;
  /** Days from report to resolution, for resolved rows. */
  tookDays?: number;
  assignedTo?: string;
  description?: string;
};

const DEMO: Demo[] = [
  { title: "Kitchen tap dripping constantly", location: "Ground floor kitchen", category: "plumbing", priority: "normal", status: "open", daysAgo: 1 },
  { title: "Fire door not closing fully", location: "Stairwell, floor 2", category: "fire_safety", priority: "urgent", status: "in_progress", daysAgo: 2, assignedTo: "Safeguard Fire Ltd" },
  { title: "Radiator cold", location: "Room 7", roomNumber: 7, category: "heating", priority: "high", status: "acknowledged", daysAgo: 3 },
  { title: "Flickering corridor light", location: "Floor 3 corridor", category: "electrical", priority: "normal", status: "open", daysAgo: 4 },
  { title: "Front gate latch sticking", location: "External gate", category: "security", priority: "high", status: "in_progress", daysAgo: 6, assignedTo: "Handyman — Dave" },
  { title: "Washing machine leaking", location: "Laundry room", category: "appliance", priority: "normal", status: "resolved", daysAgo: 9, tookDays: 2, assignedTo: "Appliance Care Co" },
  { title: "Crack in bathroom tile", location: "Room 3", roomNumber: 3, category: "structural", priority: "low", status: "open", daysAgo: 12 },
  { title: "Overflowing outdoor bins", location: "Rear yard", category: "grounds", priority: "low", status: "resolved", daysAgo: 13, tookDays: 1 },
  { title: "Shower drain slow", location: "Room 11", roomNumber: 11, category: "plumbing", priority: "normal", status: "resolved", daysAgo: 15, tookDays: 4, assignedTo: "Acme Plumbing" },
  { title: "Smoke alarm chirping", location: "Communal lounge", category: "fire_safety", priority: "high", status: "resolved", daysAgo: 16, tookDays: 0 },
  { title: "Window won't lock", location: "Room 9", roomNumber: 9, category: "security", priority: "high", status: "resolved", daysAgo: 18, tookDays: 3, assignedTo: "Handyman — Dave" },
  { title: "Oven element not heating", location: "Ground floor kitchen", category: "appliance", priority: "normal", status: "in_progress", daysAgo: 20, assignedTo: "Appliance Care Co" },
  { title: "Damp patch on ceiling", location: "Room 14", roomNumber: 14, category: "structural", priority: "normal", status: "acknowledged", daysAgo: 22 },
  { title: "Hot water intermittent", location: "Floor 1", category: "heating", priority: "high", status: "resolved", daysAgo: 24, tookDays: 5, assignedTo: "Boiler Bros" },
  { title: "Socket scorch mark", location: "Room 5", roomNumber: 5, category: "electrical", priority: "urgent", status: "resolved", daysAgo: 26, tookDays: 1, assignedTo: "Spark Electrical" },
  { title: "Loose handrail", location: "Main stairs", category: "structural", priority: "high", status: "resolved", daysAgo: 28, tookDays: 2, assignedTo: "Handyman — Dave" },
  { title: "Toilet running", location: "Room 2", roomNumber: 2, category: "plumbing", priority: "low", status: "resolved", daysAgo: 33, tookDays: 6 },
  { title: "Garden path uneven", location: "Front garden", category: "grounds", priority: "normal", status: "open", daysAgo: 35 },
  { title: "Extractor fan noisy", location: "Ground floor kitchen", category: "appliance", priority: "low", status: "resolved", daysAgo: 40, tookDays: 7 },
  { title: "Door entry buzzer faulty", location: "Front door", category: "security", priority: "high", status: "resolved", daysAgo: 44, tookDays: 2, assignedTo: "Secure Entry Ltd" },
];

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');

  const email = (process.env.SEED_HOUSING_EMAIL ?? "housing@supstaff.local").toLowerCase();
  let officer = await db.query.staff.findFirst({
    where: eq(staff.email, email),
    columns: { id: true },
  });
  if (officer) {
    console.log(`• Housing officer ${email} already exists — skipping.`);
  } else {
    const password = process.env.SEED_HOUSING_PASSWORD ?? generateTempPassword(14);
    [officer] = await db
      .insert(staff)
      .values({
        siteId: site.id,
        email,
        name: "Housing Officer",
        role: "housing_officer",
        passwordHash: await hashSecret(password),
        mustChangePassword: true,
      })
      .returning({ id: staff.id });
    console.log("\n──────────────────────────────────────────");
    console.log("  Housing officer account created");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log("──────────────────────────────────────────\n");
  }

  const existing = await db.$count(maintenanceReports, eq(maintenanceReports.siteId, site.id));
  if (existing > 0) {
    console.log(`• ${existing} building reports already exist — skipping demo reports.`);
    process.exit(0);
  }

  const reporters = await db.query.staff.findMany({
    where: eq(staff.siteId, site.id),
    columns: { id: true, role: true },
  });
  const careStaff = reporters.filter((s) => s.role !== "housing_officer");
  const now = Date.now();
  const day = 86_400_000;

  await db.transaction(async (tx) => {
    for (const [i, d] of DEMO.entries()) {
      const createdAt = new Date(now - d.daysAgo * day - (i % 5) * 3_600_000);
      const reporter = careStaff[i % Math.max(1, careStaff.length)]?.id ?? officer!.id;
      const acknowledgedAt = d.status === "open" ? null : new Date(createdAt.getTime() + 4 * 3_600_000);
      const resolvedAt =
        d.status === "resolved" ? new Date(createdAt.getTime() + (d.tookDays ?? 1) * day + 3_600_000) : null;

      const [report] = await tx
        .insert(maintenanceReports)
        .values({
          siteId: site.id,
          title: d.title,
          description: d.description ?? null,
          location: d.location,
          roomNumber: d.roomNumber ?? null,
          category: d.category,
          priority: d.priority,
          status: d.status,
          reportedByStaffId: reporter,
          assignedTo: d.assignedTo ?? null,
          acknowledgedAt,
          resolvedAt,
          resolvedByStaffId: resolvedAt ? officer!.id : null,
          createdAt,
          updatedAt: resolvedAt ?? acknowledgedAt ?? createdAt,
        })
        .returning({ id: maintenanceReports.id });

      const timeline: (typeof maintenanceReportUpdates.$inferInsert)[] = [
        { reportId: report.id, staffId: reporter, fromStatus: null, toStatus: "open", createdAt },
      ];
      if (acknowledgedAt) {
        timeline.push({
          reportId: report.id,
          staffId: officer!.id,
          fromStatus: "open",
          toStatus: d.status === "resolved" ? "in_progress" : d.status,
          note: d.assignedTo ? `Booked with ${d.assignedTo}` : null,
          createdAt: acknowledgedAt,
        });
      }
      if (resolvedAt) {
        timeline.push({
          reportId: report.id,
          staffId: officer!.id,
          fromStatus: "in_progress",
          toStatus: "resolved",
          note: "Fixed and checked",
          createdAt: resolvedAt,
        });
      }
      await tx.insert(maintenanceReportUpdates).values(timeline);
    }
  });

  console.log(`✓ Added ${DEMO.length} demo building reports`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
