/**
 * Seed the first site + manager account.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/seed.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/seed.ts --demo
 *
 * Env:
 *   SEED_MANAGER_EMAIL     (default: manager@supstaff.local)
 *   SEED_MANAGER_PASSWORD  (default: generated + printed)
 *   SEED_SITE_NAME         (default: "Supstaff House")
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { residents, sites, staff } from "../src/db/schema";
import { generateTempPassword, hashSecret } from "../src/lib/password";

async function main() {
  const demo = process.argv.includes("--demo");
  const db = getDb();

  const siteName = process.env.SEED_SITE_NAME ?? "Supstaff House";
  let site = await db.query.sites.findFirst();
  if (!site) {
    [site] = await db.insert(sites).values({ name: siteName }).returning();
    console.log(`✓ Created site "${site.name}" (${site.id})`);
  } else {
    console.log(`• Site already exists: "${site.name}"`);
  }

  const email = (
    process.env.SEED_MANAGER_EMAIL ?? "manager@supstaff.local"
  ).toLowerCase();

  const existing = await db.query.staff.findFirst({
    where: eq(staff.email, email),
  });

  if (existing) {
    console.log(`• Manager ${email} already exists — skipping.`);
  } else {
    const password =
      process.env.SEED_MANAGER_PASSWORD ?? generateTempPassword(14);
    const passwordHash = await hashSecret(password);
    await db.insert(staff).values({
      siteId: site.id,
      email,
      name: "Manager",
      role: "manager",
      isAdmin: true,
      passwordHash,
      mustChangePassword: true,
    });
    console.log("\n──────────────────────────────────────────");
    console.log(`  Manager account created`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`  (You'll set your own password on first sign-in.)`);
    console.log("──────────────────────────────────────────\n");
  }

  if (demo) {
    const count = await db.$count(residents, eq(residents.siteId, site.id));
    if (count === 0) {
      await db.insert(residents).values([
        { siteId: site.id, firstName: "Aisha", lastName: "Bello", room: "1", status: "active", riskFlags: ["Falls risk"] },
        { siteId: site.id, firstName: "Tom", lastName: "Fletcher", room: "2", status: "active", riskFlags: [] },
        { siteId: site.id, firstName: "Priya", lastName: "Nair", room: "3", status: "active", riskFlags: ["Leaves without notice"] },
        { siteId: site.id, firstName: "George", lastName: "Owusu", room: "4", status: "on_leave", riskFlags: [] },
      ]);
      console.log("✓ Added 4 demo residents");
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
