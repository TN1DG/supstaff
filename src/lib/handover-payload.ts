import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers } from "@/db/schema";
import { compareByRoom } from "@/lib/residents";

export type HandoverPayload = {
  id: string;
  date: string;
  shift: "early" | "late" | "night";
  status: "draft" | "submitted" | "locked";
  startedBy: string;
  contributors: string[];
  submittedBy: string | null;
  submittedAt: string | null;
  generalNotes: string | null;
  site: { id: string; name: string };
  entries: {
    resident: string;
    room: string | null;
    narrative: string | null;
    moodObservations: string | null;
    tasksOutstanding: string | null;
    appointments: string | null;
    incidentFlag: boolean;
  }[];
  addenda: { author: string; at: string; body: string }[];
};

const SHIFT_LABEL: Record<string, string> = {
  early: "Early",
  late: "Late",
  night: "Night",
};

export function shiftLabel(shift: string) {
  return SHIFT_LABEL[shift] ?? shift;
}

/** Plain-text rendering for pasting into Salesforce / email. */
export function handoverToText(p: HandoverPayload): string {
  const lines: string[] = [];
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(p.date));

  lines.push(`${p.site.name} — ${shiftLabel(p.shift)} shift handover`);
  lines.push(dateStr);
  lines.push(`Started by ${p.startedBy}`);
  if (p.contributors.length > 1) {
    lines.push(`Contributors: ${p.contributors.join(", ")}`);
  }
  if (p.submittedAt) {
    lines.push(
      `Submitted ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(p.submittedAt))}${p.submittedBy ? ` by ${p.submittedBy}` : ""}`,
    );
  }
  lines.push("");

  if (p.generalNotes) {
    lines.push("HOUSE NOTES");
    lines.push(p.generalNotes);
    lines.push("");
  }

  lines.push("RESIDENTS");
  for (const e of p.entries) {
    lines.push("");
    lines.push(`— ${e.resident}${e.room ? ` (Room ${e.room})` : ""}${e.incidentFlag ? "  [INCIDENT LOGGED]" : ""}`);
    if (e.narrative) lines.push(`  How the shift went: ${e.narrative}`);
    if (e.moodObservations) lines.push(`  Mood / observations: ${e.moodObservations}`);
    if (e.tasksOutstanding) lines.push(`  Tasks outstanding: ${e.tasksOutstanding}`);
    if (e.appointments) lines.push(`  Appointments: ${e.appointments}`);
    if (
      !e.narrative &&
      !e.moodObservations &&
      !e.tasksOutstanding &&
      !e.appointments
    ) {
      lines.push("  Nothing to report this shift.");
    }
  }

  if (p.addenda.length > 0) {
    lines.push("");
    lines.push("ADDED AFTERWARDS");
    for (const a of p.addenda) {
      lines.push(
        `— ${a.author}, ${new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(a.at))}: ${a.body}`,
      );
    }
  }

  return lines.join("\n");
}

export async function buildHandoverPayload(
  handoverId: string,
  siteId: string,
): Promise<HandoverPayload> {
  const db = getDb();
  const row = await db.query.handovers.findFirst({
    where: and(eq(handovers.id, handoverId), eq(handovers.siteId, siteId)),
    with: {
      site: { columns: { id: true, name: true } },
      startedBy: { columns: { name: true } },
      submittedBy: { columns: { name: true } },
      entries: {
        with: {
          resident: { columns: { firstName: true, lastName: true, preferredName: true, room: true } },
          lastEditedBy: { columns: { name: true } },
        },
      },
      addenda: {
        orderBy: (a) => [asc(a.createdAt)],
        with: { author: { columns: { name: true } } },
      },
    },
  });
  if (!row) throw new Error("Handover not found");

  // Distinct, in a stable order: starter first, then everyone who saved a card.
  const contributors = Array.from(
    new Set([
      row.startedBy.name,
      ...row.entries
        .map((e) => e.lastEditedBy?.name)
        .filter((n): n is string => Boolean(n)),
      ...(row.submittedBy ? [row.submittedBy.name] : []),
    ]),
  );

  const entries = [...row.entries]
    .sort((a, b) => compareByRoom(a.resident, b.resident))
    .map((e) => ({
      resident: e.resident.preferredName
        ? `${e.resident.preferredName} ${e.resident.lastName}`
        : `${e.resident.firstName} ${e.resident.lastName}`,
      room: e.resident.room,
      narrative: e.narrative,
      moodObservations: e.moodObservations,
      tasksOutstanding: e.tasksOutstanding,
      appointments: e.appointments,
      incidentFlag: e.incidentFlag,
    }));

  return {
    id: row.id,
    date: row.handoverDate,
    shift: row.shift,
    status: row.status,
    startedBy: row.startedBy.name,
    contributors,
    submittedBy: row.submittedBy?.name ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    generalNotes: row.generalNotes,
    site: row.site,
    entries,
    addenda: row.addenda.map((a) => ({
      author: a.author.name,
      at: a.createdAt.toISOString(),
      body: a.body,
    })),
  };
}
