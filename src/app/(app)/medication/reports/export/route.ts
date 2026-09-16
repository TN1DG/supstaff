import { guardRoute } from "@/lib/rbac";
import { rateLimitHit } from "@/lib/rate-limit";
import { roundLabel } from "@/lib/medication";
import {
  cdRegisterInRange,
  missedDosesInRange,
  refusalsInRange,
} from "../../queries";

export const dynamic = "force-dynamic";

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
  const kind = url.searchParams.get("kind") ?? "all";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const residentId = url.searchParams.get("residentId") || undefined;
  if (!from || !to) return new Response("from and to are required", { status: 400 });

  const lines: string[] = [];

  if (kind === "missed" || kind === "all") {
    const missed = await missedDosesInRange(staff.siteId, from, to, new Date());
    lines.push("Missed doses");
    lines.push(["Date", "Round", "Resident", "Medication"].map(csvCell).join(","));
    for (const m of missed) {
      lines.push(
        [m.date, roundLabel(m.round), m.residentName, m.medicationName].map(csvCell).join(","),
      );
    }
    lines.push("");
  }

  if (kind === "refusals" || kind === "all") {
    const refusals = await refusalsInRange(staff.siteId, from, to, residentId);
    lines.push("Refusals");
    lines.push(
      ["Date", "Round", "Resident", "Medication", "Reason", "Staff", "Notes"]
        .map(csvCell)
        .join(","),
    );
    for (const r of refusals) {
      lines.push(
        [
          r.scheduledDate,
          r.scheduledRound ? roundLabel(r.scheduledRound) : "PRN",
          r.residentName,
          r.medicationName,
          r.reasonLabel ?? "",
          r.staffName,
          r.notes ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    lines.push("");
  }

  if (kind === "cd" || kind === "all") {
    const cd = await cdRegisterInRange(staff.siteId, from, to, residentId);
    lines.push("Controlled drug register");
    lines.push(
      ["Date", "Round", "Resident", "Medication", "Outcome", "Staff", "Witness", "Notes"]
        .map(csvCell)
        .join(","),
    );
    for (const c of cd) {
      lines.push(
        [
          c.scheduledDate,
          c.scheduledRound ? roundLabel(c.scheduledRound) : "PRN",
          c.residentName,
          c.medicationName,
          c.outcome,
          c.staffName,
          c.witnessName ?? "",
          c.notes ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medication-${kind}-${from}-to-${to}.csv"`,
    },
  });
}
