import type { Metadata } from "next";
import { requireStaff } from "@/lib/rbac";
import { PageHeader, ComingSoon } from "@/components/page-header";

export const metadata: Metadata = { title: "Building reports" };

export default async function MaintenancePage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="Building reports"
        description="Log repairs, hazards and maintenance from the floor. Reports are forwarded to Saw-it so the manager's workflow stays the same."
      />
      <ComingSoon feature="Building reports" />
    </>
  );
}
