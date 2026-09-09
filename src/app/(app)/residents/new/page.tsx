import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { listActiveStaff } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { ResidentForm } from "../resident-form";
import { createResident } from "../actions";

export const metadata: Metadata = { title: "Add resident" };

export default async function NewResidentPage() {
  const staff = await requireRole("support_officer");
  const keyWorkers = await listActiveStaff(staff.siteId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add resident" />
      <ResidentForm action={createResident} keyWorkers={keyWorkers} />
    </div>
  );
}
