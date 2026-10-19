/**
 * Seed welfare checks for the first site: publish the organisation default
 * rules (if none), give every resident a plan, and — only when the site has
 * no welfare checks yet — a spread of demo activity relative to now, so the
 * board shows one of each state. Seeded rows skip the outbox, so demo data
 * can never reach Salesforce.
 *
 *   npm run seed:welfare
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  residents,
  residentWelfarePlans,
  staff,
  welfareAbsences,
  welfareContacts,
  welfareEscalationActions,
  welfareEscalations,
  welfarePolicyVersions,
} from "../src/db/schema";
import { DEFAULT_POLICY } from "../src/lib/welfare-policy";
import { addDays, zonedDate } from "../src/lib/zoned-time";

const MIN = 60_000;
const HOUR = 60 * MIN;

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');

  const team = await db.query.staff.findMany({
    where: and(eq(staff.siteId, site.id), eq(staff.active, true), ne(staff.role, "housing_officer")),
    orderBy: [asc(staff.name)],
    columns: { id: true, name: true, role: true },
  });
  const manager = team.find((s) => s.role === "manager");
  if (!manager) throw new Error("No active manager — run \"npm run seed\" first.");
  const worker = team.find((s) => s.role === "support_officer") ?? manager;
  const other = team.find((s) => s.id !== worker.id && s.role !== "manager") ?? manager;

  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);

  // 1 · Rules
  let version = await db.query.welfarePolicyVersions.findFirst({
    where: eq(welfarePolicyVersions.siteId, site.id),
    orderBy: (t, { desc }) => [desc(t.version)],
  });
  if (!version) {
    [version] = await db
      .insert(welfarePolicyVersions)
      .values({
        siteId: site.id,
        version: 1,
        config: DEFAULT_POLICY,
        changeNote: "First version — the organisation default (demo seed).",
        reviewDueOn: addDays(zonedDate(now, site.timezone), 365),
        publishedByStaffId: manager.id,
        publishedAt: ago(3 * 24 * HOUR),
      })
      .returning();
    console.log("✓ Published welfare rules v1 (organisation default)");
  } else {
    console.log(`• Welfare rules already published (v${version.version})`);
  }

  // 2 · Plans
  const people = await db.query.residents.findMany({
    where: and(eq(residents.siteId, site.id), eq(residents.status, "active")),
    columns: { id: true, firstName: true, room: true },
  });
  people.sort((a, b) => Number(a.room ?? 999) - Number(b.room ?? 999));
  if (people.length === 0) {
    console.log('No active residents — run "npm run seed -- --demo" first.');
    process.exit(0);
  }

  const havePlans = new Set(
    (
      await db.query.residentWelfarePlans.findMany({
        where: eq(residentWelfarePlans.siteId, site.id),
        columns: { residentId: true },
      })
    ).map((p) => p.residentId),
  );
  const tierFor = (i: number) => (i === 0 || i === 5 ? "higher" : "standard");
  const planRows = people
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => !havePlans.has(r.id) && i !== people.length - 1) // leave the last one without a plan
    .map(({ r, i }) => ({
      siteId: site.id,
      residentId: r.id,
      tierKey: tierFor(i),
      contactMethods: (i % 2 === 0 ? ["in_person", "door_knock"] : ["in_person", "phone"]) as (
        | "in_person"
        | "door_knock"
        | "phone"
      )[],
      howToCheck:
        i === 0
          ? "Prefers a knock and a quick chat. If no answer, call their mobile — they often have headphones in."
          : null,
      residentInvolved: i % 3 !== 2,
      reviewedAt: i === 2 ? ago(8 * 30 * 24 * HOUR) : ago(20 * 24 * HOUR),
      startedAt: ago(30 * 24 * HOUR),
      updatedByStaffId: worker.id,
      createdAt: ago(30 * 24 * HOUR),
    }));
  if (planRows.length) await db.insert(residentWelfarePlans).values(planRows);
  console.log(`✓ Added ${planRows.length} welfare plan(s)`);

  // 3 · Demo activity — only on a site with no checks yet
  const anyCheck = await db.query.welfareContacts.findFirst({
    where: eq(welfareContacts.siteId, site.id),
    columns: { id: true },
  });
  if (anyCheck) {
    console.log("• Welfare checks already exist — skipping demo activity");
    process.exit(0);
  }

  const contact = (
    residentId: string,
    outcome: "seen" | "contacted" | "no_response",
    method: "in_person" | "door_knock" | "phone",
    happenedAt: Date,
    by = worker.id,
    extra: { note?: string; overdueMinutes?: number; loggedAt?: Date } = {},
  ) => ({
    siteId: site.id,
    residentId,
    outcome,
    method,
    happenedAt,
    staffId: by,
    note: extra.note ?? null,
    overdueMinutes: extra.overdueMinutes ?? null,
    createdAt: extra.loggedAt ?? happenedAt,
  });

  const [esc, soon, overdue, away, late, ...rest] = people;

  // Escalating (Higher risk: 4h interval, on-call at 5h, missing at 8h):
  // last seen 6h ago → due 2h ago; on-call due an hour ago, not recorded.
  if (esc) {
    const lastSeen = ago(6 * HOUR);
    const due = new Date(lastSeen.getTime() + 4 * HOUR);
    await db.insert(welfareContacts).values([
      contact(esc.id, "seen", "in_person", lastSeen, other.id),
      contact(esc.id, "no_response", "door_knock", new Date(due.getTime() + 10 * MIN), worker.id, {
        note: "Knocked twice, music on low. No answer.",
        overdueMinutes: 10,
      }),
    ]);
    const [e] = await db
      .insert(welfareEscalations)
      .values({
        siteId: site.id,
        residentId: esc.id,
        policyVersionId: version.id,
        tierKey: "higher",
        dueAt: due,
        lastSeenAt: lastSeen,
        openedAt: new Date(due.getTime() + 10 * MIN),
        openedByStaffId: worker.id,
      })
      .returning({ id: welfareEscalations.id });
    await db.insert(welfareEscalationActions).values({
      escalationId: e.id,
      stepId: "hr-1",
      action: "retry_contact",
      note: "Called mobile — went to voicemail. Checked the lounge and garden.",
      happenedAt: new Date(due.getTime() + 20 * MIN),
      staffId: worker.id,
    });
  }

  // Due soon (Standard: 24h): seen 23h 30m ago.
  if (soon) await db.insert(welfareContacts).values(contact(soon.id, "seen", "in_person", ago(23.5 * HOUR)));

  // Overdue on Standard — first step is "as soon as overdue", so it shows as escalating with no escalation opened yet.
  if (overdue) await db.insert(welfareContacts).values(contact(overdue.id, "contacted", "phone", ago(25 * HOUR)));

  // Away on a planned absence until tomorrow evening.
  if (away) {
    await db.insert(welfareContacts).values(contact(away.id, "seen", "in_person", ago(5.5 * HOUR)));
    await db.insert(welfareAbsences).values({
      siteId: site.id,
      residentId: away.id,
      startsAt: ago(5 * HOUR),
      expectedBackAt: new Date(now.getTime() + 20 * HOUR),
      reason: "Overnight at their sister's",
      createdByStaffId: worker.id,
      createdAt: ago(5 * HOUR),
    });
  }

  // A check that came in an hour late, then fine.
  if (late) {
    await db.insert(welfareContacts).values([
      contact(late.id, "seen", "in_person", ago(28 * HOUR)),
      contact(late.id, "seen", "door_knock", ago(3 * HOUR), other.id, { overdueMinutes: 60 }),
    ]);
  }

  for (const [i, r] of rest.entries()) {
    await db.insert(welfareContacts).values(contact(r.id, "seen", "in_person", ago((1 + i) * HOUR)));
  }

  console.log("✓ Added demo welfare activity: escalating, due soon, overdue, away, late check, OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
