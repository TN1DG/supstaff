import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { StaffForm } from "../staff-form";
import { createStaff } from "../actions";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  await requireRole("manager");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add staff"
        description="Create an account and share the temporary password with them."
      />
      <StaffForm action={createStaff} />
    </div>
  );
}
