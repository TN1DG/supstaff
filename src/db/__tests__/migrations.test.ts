import { beforeAll, describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Applies every migration in drizzle/ to an in-memory Postgres, so a broken
// migration fails CI, then checks the guarantees that live in the database.

const MIGRATIONS = path.resolve(__dirname, "../../../drizzle");
let db: PGlite;

async function rejects(query: string, params: unknown[] = []) {
  await assert.rejects(db.query(query, params), /audit_log is append-only/);
}

beforeAll(async () => {
  db = new PGlite();
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }
}, 60_000);

async function seedAuditRow() {
  const site = await db.query<{ id: string }>(
    `insert into sites (name) values ('Test house') returning id`,
  );
  const siteId = site.rows[0].id;
  const person = await db.query<{ id: string }>(
    `insert into staff (site_id, email, name, password_hash)
     values ($1, $2, 'Ann', 'x') returning id`,
    [siteId, `ann-${crypto.randomUUID()}@example.com`],
  );
  const staffId = person.rows[0].id;
  const audit = await db.query<{ id: string }>(
    `insert into audit_log (site_id, actor_staff_id, actor_name, action, entity_type, after)
     values ($1, $2, 'Ann', 'medication.administer', 'medication_administration', '{"outcome":"given"}')
     returning id`,
    [siteId, staffId],
  );
  return { siteId, staffId, auditId: audit.rows[0].id };
}

describe("staff.session_version", () => {
  it("defaults to 0 for new staff", async () => {
    const { staffId } = await seedAuditRow();
    const r = await db.query<{ session_version: number }>(
      `select session_version from staff where id = $1`,
      [staffId],
    );
    assert.equal(r.rows[0].session_version, 0);
  });
});

describe("audit_log is append-only", () => {
  it("allows inserts", async () => {
    await db.query(`insert into audit_log (action, entity_type) values ('a.b', 't')`);
  });

  it("refuses edits to any column", async () => {
    const { auditId } = await seedAuditRow();
    await rejects(`update audit_log set action = 'tampered' where id = $1`, [auditId]);
    await rejects(`update audit_log set after = '{"outcome":"refused"}' where id = $1`, [auditId]);
    await rejects(`update audit_log set at = now() - interval '1 day' where id = $1`, [auditId]);
  });

  it("refuses detaching a row from a staff member or site that still exists", async () => {
    const { auditId } = await seedAuditRow();
    await rejects(`update audit_log set actor_staff_id = null where id = $1`, [auditId]);
    await rejects(`update audit_log set site_id = null where id = $1`, [auditId]);
  });

  it("refuses delete and truncate", async () => {
    const { auditId } = await seedAuditRow();
    await rejects(`delete from audit_log where id = $1`, [auditId]);
    await rejects(`truncate audit_log`);
  });

  it("lets the ON DELETE SET NULL foreign key through, keeping the actor's name", async () => {
    const { staffId, auditId } = await seedAuditRow();
    await db.query(`delete from staff where id = $1`, [staffId]);
    const r = await db.query<{ actor_staff_id: string | null; actor_name: string; action: string }>(
      `select actor_staff_id, actor_name, action from audit_log where id = $1`,
      [auditId],
    );
    assert.deepEqual(r.rows[0], {
      actor_staff_id: null,
      actor_name: "Ann",
      action: "medication.administer",
    });
  });
});
