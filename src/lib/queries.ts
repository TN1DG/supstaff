import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";

/** Active staff at a site, for key-worker / assignee pickers. */
export async function listActiveStaff(siteId: string) {
  return getDb().query.staff.findMany({
    where: and(eq(staff.siteId, siteId), eq(staff.active, true)),
    columns: { id: true, name: true, role: true },
    orderBy: [asc(staff.name)],
  });
}
