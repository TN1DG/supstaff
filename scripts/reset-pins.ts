/**
 * Clear every staff signing PIN, forcing each person to set a new one.
 *
 * Run this after any change to how staff rows are queried or passed around,
 * or whenever stored PIN hashes should no longer be trusted. Clearing them is
 * cheap: each person is prompted to set a new PIN the next time they sign an
 * action.
 *
 * Dry-run by default — pass --apply to actually clear.
 *
 *   npm run reset:pins            # show what would change
 *   npm run reset:pins -- --apply # clear them
 */
import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "../src/db";
import { staff } from "../src/db/schema";
import { writeAudit } from "../src/lib/audit";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const withPins = await db.query.staff.findMany({
    where: isNotNull(staff.pinHash),
    columns: { id: true, name: true, email: true, siteId: true },
  });

  if (withPins.length === 0) {
    console.log("No staff currently have a PIN set — nothing to do.");
    process.exit(0);
  }

  console.log(`${withPins.length} staff member(s) have a PIN set:`);
  for (const s of withPins) console.log(`  ${s.email.padEnd(26)} ${s.name}`);

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to clear.");
    process.exit(0);
  }

  // No request context in a script, so pass `ctx` explicitly rather than
  // letting writeAudit reach for headers().
  const ctx = { ip: null, userAgent: "scripts/reset-pins.ts" };

  await db.transaction(async (tx) => {
    for (const s of withPins) {
      await tx
        .update(staff)
        .set({ pinHash: null, updatedAt: new Date() })
        .where(eq(staff.id, s.id));
      await writeAudit(
        tx,
        {
          siteId: s.siteId,
          actorStaffId: null,
          actorName: "System (PIN exposure remediation)",
          action: "staff.reset_pin",
          entityType: "staff",
          entityId: s.id,
          before: { hadPin: true },
          after: { hadPin: false },
        },
        ctx,
      );
    }
  });

  console.log(`\n✓ Cleared ${withPins.length} PIN(s). Each person will be asked to set a new one on their next signed action.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
