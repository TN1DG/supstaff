import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { createMedication } from "@/app/(app)/medication/actions";
import { MedicationForm } from "@/app/(app)/residents/medication-form";

export const metadata: Metadata = { title: "Add medication" };

export default async function NewMedicationPage({
  params,
}: PageProps<"/residents/[id]/medication/new">) {
  const { id } = await params;
  const staff = await requireRole("support_officer");

  const resident = await getDb().query.residents.findFirst({
    where: and(eq(residents.id, id), eq(residents.siteId, staff.siteId)),
    columns: { id: true, firstName: true, lastName: true, preferredName: true },
  });
  if (!resident) notFound();

  const displayName = resident.preferredName
    ? `${resident.preferredName} ${resident.lastName}`
    : `${resident.firstName} ${resident.lastName}`;

  return (
    <>
      <PageHeader title="Add medication" description={displayName} />
      <MedicationForm action={createMedication.bind(null, id)} residentId={id} />
    </>
  );
}
