import { and, eq } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * `where` clause for "this row, but only if it belongs to my site" — the
 * tenant-isolation check every single-row lookup in a server action needs.
 *
 *   db.query.residents.findFirst({ where: bySite(residents, id, staff.siteId) })
 */
export function bySite(
  table: { id: PgColumn; siteId: PgColumn },
  id: string,
  siteId: string,
) {
  return and(eq(table.id, id), eq(table.siteId, siteId));
}
