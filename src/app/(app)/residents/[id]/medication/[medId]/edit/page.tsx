import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { medicationSchedules, medications, residents } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { bySite } from "@/lib/db-scope";
import { PageHeader } from "@/components/page-header";
import { updateMedication } from "@/app/(app)/medication/actions";
import { MedicationForm } from "@/app/(app)/residents/medication-form";

export const metadata: Metadata = { title: "Edit medication" };

export default async function EditMedicationPage({
  params,
}: PageProps<"/residents/[id]/medication/[medId]/edit">) {
  const { id, medId } = await params;
  const staff = await requireRole("support_officer");

  const [resident, medication, schedules] = await Promise.all([
    getDb().query.residents.findFirst({
      where: and(eq(residents.id, id), eq(residents.siteId, staff.siteId)),
      columns: { id: true, firstName: true, lastName: true, preferredName: true },
    }),
    getDb().query.medications.findFirst({
      where: bySite(medications, medId, staff.siteId),
    }),
    getDb().query.medicationSchedules.findMany({
      where: eq(medicationSchedules.medicationId, medId),
    }),
  ]);
  if (!resident || !medication || medication.residentId !== id) notFound();

  const displayName = resident.preferredName
    ? `${resident.preferredName} ${resident.lastName}`
    : `${resident.firstName} ${resident.lastName}`;

  return (
    <>
      <PageHeader title="Edit medication" description={displayName} />
      <MedicationForm
        action={updateMedication.bind(null, medId)}
        residentId={id}
        medication={medication}
        schedules={schedules}
      />
    </>
  );
}
