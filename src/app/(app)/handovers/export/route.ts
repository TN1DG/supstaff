import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers } from "@/db/schema";
import { guardRoute } from "@/lib/rbac";
import { rateLimitHit } from "@/lib/rate-limit";
import { shiftLabel } from "@/lib/handover-payload";

export const dynamic = "force-dynamic";

// Full-history CSV build — one manager pulling it in a loop shouldn't hammer
// the DB.
const EXPORT_LIMIT = { limit: 10, windowSec: 60 };

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const staff = await guardRoute("manager");
  if (staff instanceof Response) return staff;

  const throttled = await rateLimitHit(`export:${staff.id}`, EXPORT_LIMIT);
  if (!throttled.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(throttled.retryAfterSec) },
    });
  }

  const url = new URL(request.url);
  const shift = url.searchParams.get("shift");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const incidentsOnly = url.searchParams.get("incidents") === "1";

  const rows = await getDb().query.handovers.findMany({
    where: and(
      eq(handovers.siteId, staff.siteId),
      shift && ["early", "late", "night"].includes(shift)
        ? eq(handovers.shift, shift as "early" | "late" | "night")
        : undefined,
      from ? gte(handovers.handoverDate, from) : undefined,
      to ? lte(handovers.handoverDate, to) : undefined,
    ),
    orderBy: [asc(handovers.handoverDate)],
    with: {
      startedBy: { columns: { name: true } },
      submittedBy: { columns: { name: true } },
      entries: {
        with: { resident: { columns: { firstName: true, lastName: true } } },
      },
    },
  });

  const header = [
    "Date",
    "Shift",
    "Started by",
    "Submitted by",
    "Status",
    "Submitted at",
    "Resident",
    "Incident",
    "How the shift went",
    "Mood / observations",
    "Tasks outstanding",
    "Appointments",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const h of rows) {
    if (incidentsOnly && !h.entries.some((e) => e.incidentFlag)) continue;
    const base = [
      h.handoverDate,
      shiftLabel(h.shift),
      h.startedBy.name,
      h.submittedBy?.name ?? "",
      h.status,
      h.submittedAt ? h.submittedAt.toISOString() : "",
    ];
    if (h.entries.length === 0) {
      lines.push([...base, "", "", "", "", "", ""].map(csvCell).join(",")); // resident + 5 note cols
      continue;
    }
    for (const e of h.entries) {
      lines.push(
        [
          ...base,
          `${e.resident.firstName} ${e.resident.lastName}`,
          e.incidentFlag ? "yes" : "",
          e.narrative ?? "",
          e.moodObservations ?? "",
          e.tasksOutstanding ?? "",
          e.appointments ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="handovers-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
