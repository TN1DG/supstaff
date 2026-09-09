import type { Metadata } from "next";
import { requireStaff } from "@/lib/rbac";
import { PageHeader, ComingSoon } from "@/components/page-header";

export const metadata: Metadata = { title: "Medication" };

export default async function MedicationPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="Medication"
        description="Structured MAR records, per-round sign-off and a full audit trail — replacing the paper chart."
      />
      <ComingSoon feature="The eMAR" />
    </>
  );
}
