/**
 * Rebuild a full set of handover test scenarios on the first site.
 *
 *   npm run seed:handovers
 *
 * Wipes existing handovers (+ entries / addenda / acknowledgements / handover
 * outbox rows) for the site, then recreates:
 *   - test staff accounts (known password + PINs, no forced password change)
 *   - drafts (mine / someone else's / no-PIN author)
 *   - submitted handovers covering incidents, outstanding tasks, addenda,
 *     acknowledgements, empty entries, a discharged resident, Salesforce queue
 *     state, and a date spread for the manager filters + CSV export.
 *
 * Every test account password:  Handover!Test1
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  handoverAcknowledgements,
  handoverAddenda,
  handoverResidentEntries,
  handovers,
  outbox,
  residents,
  staff,
} from "../src/db/schema";
import { hashSecret } from "../src/lib/password";

const PASSWORD = "Handover!Test1";

const TEST_STAFF = [
  { key: "manager", email: "manager@test.local", name: "Morgan Reid", role: "manager", pin: "1234", isAdmin: true },
  { key: "amy", email: "amy@test.local", name: "Amy Turner", role: "support_officer", pin: "1111", isAdmin: false },
  { key: "ben", email: "ben@test.local", name: "Ben Carter", role: "support_officer", pin: "2222", isAdmin: false },
  { key: "cara", email: "cara@test.local", name: "Cara Diaz", role: "bank_staff", pin: "3333", isAdmin: false },
  { key: "dan", email: "dan@test.local", name: "Dan Ellis", role: "support_officer", pin: null, isAdmin: false },
] as const;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function tsDaysAgo(n: number, hour = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 30, 0, 0);
  return d;
}

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site — run "npm run seed" first.');

  // ---- test staff --------------------------------------------------------
  const passwordHash = await hashSecret(PASSWORD);
  const id: Record<string, string> = {};

  for (const s of TEST_STAFF) {
    const pinHash = s.pin ? await hashSecret(s.pin) : null;
    const existing = await db.query.staff.findFirst({
      where: eq(staff.email, s.email),
      columns: { id: true },
    });
    if (existing) {
      await db
        .update(staff)
        .set({
          name: s.name,
          role: s.role,
          isAdmin: s.isAdmin,
          passwordHash,
          pinHash,
          mustChangePassword: false,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(staff.id, existing.id));
      id[s.key] = existing.id;
    } else {
      const [row] = await db
        .insert(staff)
        .values({
          siteId: site.id,
          email: s.email,
          name: s.name,
          role: s.role,
          isAdmin: s.isAdmin,
          passwordHash,
          pinHash,
          mustChangePassword: false,
        })
        .returning({ id: staff.id });
      id[s.key] = row.id;
    }
  }

  // ---- residents: key workers + one discharged --------------------------
  const roster = await db.query.residents.findMany({
    where: eq(residents.siteId, site.id),
    columns: { id: true, firstName: true, lastName: true },
    orderBy: (r, { asc }) => [asc(r.lastName), asc(r.firstName)],
  });
  if (roster.length < 6) {
    throw new Error('Need at least 6 residents — run "npm run seed:residents" first.');
  }
  const R = roster.map((r) => r.id);

  // Amy key-works the first 3, Ben the next 3.
  await db.update(residents).set({ keyWorkerId: id.amy }).where(inArray(residents.id, R.slice(0, 3)));
  await db.update(residents).set({ keyWorkerId: id.ben }).where(inArray(residents.id, R.slice(3, 6)));
  // Last resident on the roster is discharged (still referenced by scenario 9).
  const dischargedResident = R[R.length - 1];
  await db
    .update(residents)
    .set({ status: "discharged", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(residents.id, dischargedResident));

  // ---- wipe existing handover data for the site ------------------------
  const old = await db.query.handovers.findMany({
    where: eq(handovers.siteId, site.id),
    columns: { id: true },
  });
  const oldIds = old.map((h) => h.id);
  if (oldIds.length) {
    await db.delete(handoverAcknowledgements).where(inArray(handoverAcknowledgements.handoverId, oldIds));
    await db.delete(handoverAddenda).where(inArray(handoverAddenda.handoverId, oldIds));
    await db.delete(handoverResidentEntries).where(inArray(handoverResidentEntries.handoverId, oldIds));
    await db.delete(outbox).where(
      and(eq(outbox.entityType, "handover"), inArray(outbox.entityId, oldIds)),
    );
    await db.delete(handovers).where(inArray(handovers.id, oldIds));
  }

  // ---- scenario builder -----------------------------------------------
  type EntrySeed = {
    r: string;
    narrative?: string;
    mood?: string;
    tasks?: string;
    appts?: string;
    incident?: boolean;
    /** staff key of the last person to save this card (defaults to `author`) */
    editedBy?: string;
  };
  type Scenario = {
    label: string;
    /** staff key of whoever opened the handover for the shift */
    author: string;
    date: string;
    shift: "early" | "late" | "night";
    status: "draft" | "submitted";
    submittedAt?: Date;
    /** staff key of whoever PIN-signed it (defaults to `author`) */
    submittedBy?: string;
    generalNotes?: string;
    /** staff key of whoever wrote the house notes (defaults to `author`) */
    notesBy?: string;
    entries: EntrySeed[];
    addenda?: { author: string; body: string; at: Date }[];
    acks?: { staff: string; at: Date }[];
    queueSalesforce?: boolean;
  };

  const scenarios: Scenario[] = [
    {
      label: "1. Draft — opened by Amy, nothing filled in yet",
      author: "amy",
      date: isoDaysAgo(0),
      shift: "early",
      status: "draft",
      entries: R.slice(0, 5).map((r) => ({ r })),
    },
    {
      label: "2. Draft — MULTI-CONTRIBUTOR: Amy started, Ben + Cara own cards, manager wrote house notes, 1 incident",
      author: "amy",
      date: isoDaysAgo(0),
      shift: "late",
      status: "draft",
      generalNotes: "Boiler engineer booked for tomorrow AM. Agency cover confirmed for night.",
      notesBy: "manager",
      entries: [
        { r: R[0], narrative: "Settled day. Ate well.", mood: "Bright and chatty.", editedBy: "amy" },
        { r: R[1], narrative: "Physio visit went well.", tasks: "Chase repeat prescription — pharmacy closes 6pm.", editedBy: "ben" },
        { r: R[2], narrative: "Fall in the bathroom ~14:00, no injury, body map completed.", incident: true, tasks: "GP to review mobility.", editedBy: "cara" },
        { r: R[3], editedBy: "ben" },
        { r: R[4] },
      ],
    },
    {
      label: "3. Draft — opened by Ben; ANY staff (Amy, a manager) can pick it up and edit/submit",
      author: "ben",
      date: isoDaysAgo(0),
      shift: "night",
      status: "draft",
      entries: [
        { r: R[3], narrative: "Slept through.", editedBy: "ben" },
        { r: R[4], narrative: "Up twice for the toilet, settled quickly.", editedBy: "ben" },
      ],
    },
    {
      label: "4. Submitted — most recent. Outstanding tasks (drives the list card), started by Amy, submitted by Ben, 1 addendum, 2 acks.",
      author: "amy",
      submittedBy: "ben",
      date: isoDaysAgo(1),
      shift: "late",
      status: "submitted",
      submittedAt: tsDaysAgo(1, 22),
      generalNotes: "Fire alarm test completed. New sharps bin in the clinic room.",
      notesBy: "amy",
      entries: [
        { r: R[0], narrative: "Good afternoon in the garden.", tasks: "Optician appointment to be booked for next week.", editedBy: "amy" },
        { r: R[1], narrative: "Bit withdrawn after family visit.", mood: "Low mood, monitor.", tasks: "Key worker to check in tomorrow.", editedBy: "cara" },
        { r: R[2], narrative: "Enjoyed the music session.", editedBy: "ben" },
        { r: R[3], appts: "Dentist Thursday 10:00 — transport booked.", editedBy: "ben" },
        { r: R[4] },
      ],
      addenda: [
        { author: "manager", body: "Optician appointment now booked for Tuesday 11:30.", at: tsDaysAgo(0, 9) },
      ],
      acks: [
        { staff: "ben", at: tsDaysAgo(0, 6) },
        { staff: "manager", at: tsDaysAgo(0, 8) },
      ],
      queueSalesforce: true,
    },
    {
      label: "5. Submitted — 2 incidents (list badge = 2, incidents-only filter, CSV incidents=1).",
      author: "ben",
      date: isoDaysAgo(2),
      shift: "night",
      status: "submitted",
      submittedAt: tsDaysAgo(2, 6),
      entries: [
        { r: R[3], narrative: "Found trying to leave via the fire door 02:10. Redirected, settled with a warm drink.", incident: true, tasks: "Review door alarm sensitivity with maintenance." },
        { r: R[4], narrative: "Minor skin tear to left forearm during personal care. Dressed, body map done, GP informed.", incident: true },
        { r: R[0], narrative: "Slept well." },
      ],
      acks: [{ staff: "manager", at: tsDaysAgo(1, 8) }],
      queueSalesforce: true,
    },
    {
      label: "6. Submitted — no acknowledgements yet (Amy sees 'I've read this').",
      author: "manager",
      date: isoDaysAgo(3),
      shift: "early",
      status: "submitted",
      submittedAt: tsDaysAgo(3, 14),
      entries: [
        { r: R[1], narrative: "Quiet morning." },
        { r: R[2], narrative: "Refused breakfast, ate a good lunch." },
      ],
    },
    {
      label: "7. Submitted — fully acknowledged, 3 addenda.",
      author: "amy",
      date: isoDaysAgo(4),
      shift: "late",
      status: "submitted",
      submittedAt: tsDaysAgo(4, 22),
      entries: [
        { r: R[0], narrative: "Lovely day." },
        { r: R[1], narrative: "Chest sounded rattly — GP called, advised monitoring.", mood: "Tired.", tasks: "Recheck temperature overnight." },
        { r: R[2] },
      ],
      addenda: [
        { author: "ben", body: "Temp 37.9 at 01:00, 37.4 at 05:00. Comfortable.", at: tsDaysAgo(3, 5) },
        { author: "manager", body: "GP visited, prescribed antibiotics. On the MAR chart now.", at: tsDaysAgo(3, 11) },
        { author: "ben", body: "First dose given with lunch, tolerated well.", at: tsDaysAgo(3, 13) },
      ],
      acks: [
        { staff: "ben", at: tsDaysAgo(3, 6) },
        { staff: "manager", at: tsDaysAgo(3, 9) },
        { staff: "cara", at: tsDaysAgo(3, 20) },
      ],
      queueSalesforce: true,
    },
    {
      label: "8. Submitted — every entry empty ('Nothing to report this shift.').",
      author: "ben",
      date: isoDaysAgo(5),
      shift: "night",
      status: "submitted",
      submittedAt: tsDaysAgo(5, 6),
      entries: R.slice(0, 4).map((r) => ({ r })),
    },
    {
      label: "9. Submitted — includes a discharged resident's entry (edit roster keeps them).",
      author: "amy",
      date: isoDaysAgo(6),
      shift: "early",
      status: "submitted",
      submittedAt: tsDaysAgo(6, 14),
      entries: [
        { r: R[0], narrative: "Good start to the day." },
        { r: dischargedResident, narrative: "Packed and ready — family collecting at noon. Discharge paperwork with the manager.", tasks: "Return medication to pharmacy." },
      ],
      acks: [{ staff: "manager", at: tsDaysAgo(5, 10) }],
    },
    {
      label: "10a. Older submitted (manager) — 8 days ago, for date-range filter + CSV.",
      author: "manager",
      date: isoDaysAgo(8),
      shift: "late",
      status: "submitted",
      submittedAt: tsDaysAgo(8, 22),
      entries: [{ r: R[1], narrative: "Uneventful." }, { r: R[2], narrative: "Enjoyed a walk." }],
    },
    {
      label: "10b. Older submitted (Ben) — 10 days ago, 1 incident.",
      author: "ben",
      date: isoDaysAgo(10),
      shift: "early",
      status: "submitted",
      submittedAt: tsDaysAgo(10, 14),
      entries: [
        { r: R[3], narrative: "Slipped on a wet floor near the kitchen, no injury. Cleaning schedule reviewed.", incident: true },
        { r: R[4], narrative: "Good appetite." },
      ],
      queueSalesforce: true,
    },
    {
      label: "10c. Older submitted (Amy) — 14 days ago.",
      author: "amy",
      date: isoDaysAgo(14),
      shift: "night",
      status: "submitted",
      submittedAt: tsDaysAgo(14, 6),
      entries: [{ r: R[0], narrative: "Settled night." }],
    },
    {
      label: "10d. Older submitted (manager) — 21 days ago (edge of a 3-week range).",
      author: "manager",
      date: isoDaysAgo(21),
      shift: "late",
      status: "submitted",
      submittedAt: tsDaysAgo(21, 22),
      entries: [{ r: R[2], narrative: "Quiet evening." }],
    },
    {
      label: "12. Submitted — opened by bank staff (Cara).",
      author: "cara",
      date: isoDaysAgo(7),
      shift: "early",
      status: "submitted",
      submittedAt: tsDaysAgo(7, 14),
      entries: [
        { r: R[1], narrative: "Covered the early shift. All calm." },
        { r: R[2], narrative: "Helped with breakfast, good mood.", mood: "Cheerful." },
      ],
      acks: [{ staff: "amy", at: tsDaysAgo(6, 9) }],
    },
    {
      label: "13. Draft — a contributor (Dan) has NO signing PIN. Submitting prompts 'set a PIN first'.",
      author: "dan",
      date: isoDaysAgo(1),
      shift: "early",
      status: "draft",
      entries: [{ r: R[2], narrative: "Shadowing shift — notes for review.", editedBy: "dan" }],
    },
  ];

  let count = 0;
  for (const sc of scenarios) {
    const when = sc.submittedAt ?? new Date();
    const [h] = await db
      .insert(handovers)
      .values({
        siteId: site.id,
        handoverDate: sc.date,
        shift: sc.shift,
        startedByStaffId: id[sc.author],
        status: sc.status,
        generalNotes: sc.generalNotes ?? null,
        generalNotesUpdatedAt: sc.generalNotes ? when : null,
        generalNotesByStaffId: sc.generalNotes
          ? id[sc.notesBy ?? sc.author]
          : null,
        submittedAt: sc.submittedAt ?? null,
        submittedByStaffId:
          sc.status === "submitted" ? id[sc.submittedBy ?? sc.author] : null,
        createdAt: when,
        updatedAt: when,
      })
      .returning({ id: handovers.id });

    if (sc.entries.length) {
      await db.insert(handoverResidentEntries).values(
        sc.entries.map((e) => ({
          handoverId: h.id,
          residentId: e.r,
          narrative: e.narrative ?? null,
          moodObservations: e.mood ?? null,
          tasksOutstanding: e.tasks ?? null,
          appointments: e.appts ?? null,
          incidentFlag: e.incident ?? false,
          lastEditedByStaffId:
            e.narrative || e.mood || e.tasks || e.appts || e.incident
              ? id[e.editedBy ?? sc.author]
              : null,
          createdAt: when,
          updatedAt: when,
        })),
      );
    }

    if (sc.addenda?.length) {
      await db.insert(handoverAddenda).values(
        sc.addenda.map((a) => ({
          handoverId: h.id,
          authorStaffId: id[a.author],
          body: a.body,
          createdAt: a.at,
        })),
      );
    }

    if (sc.acks?.length) {
      await db.insert(handoverAcknowledgements).values(
        sc.acks.map((a) => ({
          handoverId: h.id,
          staffId: id[a.staff],
          readAt: a.at,
        })),
      );
    }

    if (sc.queueSalesforce) {
      await db.insert(outbox).values({
        siteId: site.id,
        target: "salesforce",
        entityType: "handover",
        entityId: h.id,
        payload: { handoverId: h.id, note: "seed" },
        status: "pending",
      });
    }

    count++;
    console.log(`  ✓ ${sc.label}`);
  }

  console.log(`\n${count} handover scenarios created on "${site.name}".`);
  console.log(`\nTest accounts (password: ${PASSWORD}):`);
  for (const s of TEST_STAFF) {
    console.log(
      `  ${s.email.padEnd(20)} ${s.role.padEnd(16)} PIN ${s.pin ?? "(none — for the 'set a PIN' path)"}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
