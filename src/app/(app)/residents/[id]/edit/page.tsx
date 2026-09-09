import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { listActiveStaff } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ResidentForm } from "../../resident-form";
import { updateResident } from "../../actions";

export const metadata: Metadata = { title: "Edit resident" };

export default async function EditResidentPage({
  params,
}: PageProps<"/residents/[id]/edit">) {
  const { id } = await params;
  const staff = await requireRole("support_officer");

  const [resident, keyWorkers] = await Promise.all([
    getDb().query.residents.findFirst({
      where: and(eq(residents.id, id), eq(residents.siteId, staff.siteId)),
    }),
    listActiveStaff(staff.siteId),
  ]);
  if (!resident) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit ${resident.firstName} ${resident.lastName}`} />
      <ResidentForm
        action={updateResident.bind(null, id)}
        resident={resident}
        keyWorkers={keyWorkers}
      />
    </div>
  );
}
