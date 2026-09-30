import { canManageBuilding, guardRoute } from "@/lib/rbac";
import { rateLimitHit } from "@/lib/rate-limit";
import {
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
} from "@/lib/maintenance";
import { nightCheckFindings, parseFilters, reportsInRange } from "../queries";

export const dynamic = "force-dynamic";

const EXPORT_LIMIT = { limit: 10, windowSec: 60 };

/**
 * Quote for CSV, and neutralise spreadsheet formulas — report titles and notes
 * are free text typed by staff, so a leading `=`/`+`/`-`/`@` must not execute
 * when the housing officer opens the file in Excel.
 */
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(csvCell).join(",");
const iso = (d: Date | null) => (d ? d.toISOString() : "");

export async function GET(request: Request) {
  const staff = await guardRoute();
  if (staff instanceof Response) return staff;
  if (!canManageBuilding(staff.role)) return new Response("Forbidden", { status: 403 });

  const throttled = await rateLimitHit(`export:${staff.id}`, EXPORT_LIMIT);
  if (!throttled.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(throttled.retryAfterSec) },
    });
  }

  const url = new URL(request.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));

  const [reports, findings] = await Promise.all([
    reportsInRange(staff.siteId, filters),
    nightCheckFindings(staff.siteId, filters.from, filters.to),
  ]);

  const lines: string[] = [
    "Building reports",
    row([
      "Reported at",
      "Title",
      "Location",
      "Room",
      "Category",
      "Priority",
      "Status",
      "Assigned to",
      "Reported by",
      "Acknowledged at",
      "Resolved at",
      "Description",
      "Report id",
    ]),
    ...reports.map((r) =>
      row([
        iso(r.createdAt),
        r.title,
        r.location,
        r.roomNumber,
        MAINTENANCE_CATEGORY_LABEL[r.category],
        MAINTENANCE_PRIORITY_META[r.priority].label,
        MAINTENANCE_STATUS_META[r.status].label,
        r.assignedTo,
        r.reportedBy?.name,
        iso(r.acknowledgedAt),
        iso(r.resolvedAt),
        r.description,
        r.id,
      ]),
    ),
    "",
    "Night-check findings",
    row(["Night", "Round", "Area", "Item", "Note", "Staff", "Report status"]),
    ...findings.map((f) =>
      row([
        f.checkDate,
        f.roundTime,
        f.area,
        f.description,
        f.note,
        f.staffName,
        f.reportStatus ? MAINTENANCE_STATUS_META[f.reportStatus].label : "Not raised",
      ]),
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="building-reports-${filters.from}-to-${filters.to}.csv"`,
    },
  });
}
