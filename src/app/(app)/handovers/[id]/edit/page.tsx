import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers, residents } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { shiftLabel } from "@/lib/handover-payload";
import { PageHeader } from "@/components/page-header";
import { HandoverForm, type ResidentEntry } from "../../handover-form";

export const metadata: Metadata = { title: "Edit handover" };

export default async function EditHandoverPage({
  params,
}: PageProps<"/handovers/[id]/edit">) {
  const { id } = await params;
  const staff = await requireStaff();
  const db = getDb();

  const handover = await db.query.handovers.findFirst({
    where: and(eq(handovers.id, id), eq(handovers.siteId, staff.siteId)),
    with: {
      entries: { with: { lastEditedBy: { columns: { name: true } } } },
      generalNotesBy: { columns: { name: true } },
    },
  });
  if (!handover) notFound();

  // Any staff on shift may edit a draft; once submitted it's read-only.
  if (handover.status !== "draft") redirect(`/handovers/${id}`);

  const entryByResident = new Map(
    handover.entries.map((e) => [e.residentId, e]),
  );

  const roster = await db.query.residents.findMany({
    where: and(
      eq(residents.siteId, staff.siteId),
      or(
        eq(residents.status, "active"),
        handover.entries.length
          ? or(...handover.entries.map((e) => eq(residents.id, e.residentId)))
          : undefined,
      ),
    ),
    orderBy: [asc(residents.lastName), asc(residents.firstName)],
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      room: true,
      keyWorkerId: true,
    },
  });

  const entries: ResidentEntry[] = roster.map((r) => {
    const e = entryByResident.get(r.id);
    return {
      residentId: r.id,
      name: r.preferredName
        ? `${r.preferredName} ${r.lastName}`
        : `${r.firstName} ${r.lastName}`,
      room: r.room,
      isKeyWorker: r.keyWorkerId === staff.id,
      narrative: e?.narrative ?? null,
      moodObservations: e?.moodObservations ?? null,
      tasksOutstanding: e?.tasksOutstanding ?? null,
      appointments: e?.appointments ?? null,
      incidentFlag: e?.incidentFlag ?? false,
      updatedAt: e ? String(e.updatedAt.getTime()) : "",
      lastEditedBy: e?.lastEditedBy?.name ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Edit handover"
        description={`${shiftLabel(handover.shift)} shift · ${new Intl.DateTimeFormat(
          "en-GB",
          { dateStyle: "full" },
        ).format(new Date(handover.handoverDate))}`}
      />
      <HandoverForm
        handoverId={handover.id}
        handoverDate={handover.handoverDate}
        shift={handover.shift}
        generalNotes={handover.generalNotes}
        generalNotesUpdatedAt={
          handover.generalNotesUpdatedAt
            ? String(handover.generalNotesUpdatedAt.getTime())
            : ""
        }
        generalNotesBy={handover.generalNotesBy?.name ?? null}
        entries={entries}
      />
    </>
  );
}
