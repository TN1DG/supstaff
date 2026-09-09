/**
 * Seed the first site with a roster of 15 residents (idempotent — matches on
 * first + last name, inserts only what's missing).
 *
 *   npm run seed:residents
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { residents } from "../src/db/schema";

type Seed = {
  firstName: string;
  lastName: string;
  preferredName?: string;
  room: string;
  status: "active" | "on_leave" | "discharged";
  riskFlags: string[];
  dateOfBirth?: string;
};

const PEOPLE: Seed[] = [
  { firstName: "Aisha", lastName: "Bello", room: "1", status: "active", riskFlags: ["Falls risk"], dateOfBirth: "1946-03-12" },
  { firstName: "Tom", lastName: "Fletcher", preferredName: "Tommy", room: "2", status: "active", riskFlags: [], dateOfBirth: "1951-11-02" },
  { firstName: "Priya", lastName: "Nair", room: "3", status: "active", riskFlags: ["Leaves without notice"], dateOfBirth: "1939-07-25" },
  { firstName: "George", lastName: "Owusu", room: "4", status: "on_leave", riskFlags: [], dateOfBirth: "1943-01-19" },
  { firstName: "Margaret", lastName: "Hughes", preferredName: "Peggy", room: "5", status: "active", riskFlags: ["Falls risk", "Diabetes"], dateOfBirth: "1937-09-08" },
  { firstName: "Raymond", lastName: "Clarke", room: "6", status: "active", riskFlags: ["Wandering"], dateOfBirth: "1948-05-30" },
  { firstName: "Fatima", lastName: "Khan", room: "7", status: "active", riskFlags: [], dateOfBirth: "1955-02-14" },
  { firstName: "Derek", lastName: "Sullivan", room: "8", status: "active", riskFlags: ["Choking risk"], dateOfBirth: "1941-12-21" },
  { firstName: "Joan", lastName: "Whitfield", room: "9", status: "active", riskFlags: ["Falls risk"], dateOfBirth: "1935-06-17" },
  { firstName: "Michael", lastName: "Adeyemi", preferredName: "Mike", room: "10", status: "on_leave", riskFlags: [], dateOfBirth: "1950-08-03" },
  { firstName: "Sandra", lastName: "Bryant", room: "11", status: "active", riskFlags: ["Pressure sores"], dateOfBirth: "1944-10-11" },
  { firstName: "Alan", lastName: "Pearce", room: "12", status: "active", riskFlags: [], dateOfBirth: "1953-04-27" },
  { firstName: "Edith", lastName: "Ramsay", preferredName: "Edie", room: "13", status: "active", riskFlags: ["Dementia", "Falls risk"], dateOfBirth: "1932-01-05" },
  { firstName: "Colin", lastName: "Doherty", room: "14", status: "active", riskFlags: ["Absconding risk"], dateOfBirth: "1947-09-16" },
  { firstName: "Rita", lastName: "Osei", room: "15", status: "active", riskFlags: [], dateOfBirth: "1949-03-29" },
];

async function main() {
  const db = getDb();
  const site = await db.query.sites.findFirst();
  if (!site) throw new Error('No site found — run "npm run seed" first.');

  const existing = await db.query.residents.findMany({
    where: eq(residents.siteId, site.id),
    columns: { firstName: true, lastName: true },
  });
  const have = new Set(
    existing.map((r) => `${r.firstName} ${r.lastName}`.toLowerCase()),
  );

  const rows = PEOPLE.filter(
    (p) => !have.has(`${p.firstName} ${p.lastName}`.toLowerCase()),
  ).map((p) => ({
    siteId: site.id,
    firstName: p.firstName,
    lastName: p.lastName,
    preferredName: p.preferredName ?? null,
    room: p.room,
    status: p.status,
    riskFlags: p.riskFlags,
    dateOfBirth: p.dateOfBirth ?? null,
    admissionDate: "2024-01-15",
  }));

  if (rows.length > 0) await db.insert(residents).values(rows);

  const total = await db.$count(residents, eq(residents.siteId, site.id));
  console.log(
    `✓ Inserted ${rows.length} resident(s). "${site.name}" now has ${total}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
