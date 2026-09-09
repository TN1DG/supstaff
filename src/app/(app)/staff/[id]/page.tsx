import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff as staffTable } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { StaffForm } from "../staff-form";
import { updateStaff } from "../actions";
import { ResetPasswordButton } from "./reset-password-button";

export const metadata: Metadata = { title: "Edit staff" };

export default async function EditStaffPage({
  params,
}: PageProps<"/staff/[id]">) {
  const { id } = await params;
  const me = await requireRole("manager");

  const person = await getDb().query.staff.findFirst({
    where: and(eq(staffTable.id, id), eq(staffTable.siteId, me.siteId)),
  });
  if (!person) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={person.name} description={person.email}>
        <ResetPasswordButton id={person.id} name={person.name} />
      </PageHeader>
      <StaffForm action={updateStaff.bind(null, id)} person={person} />
    </div>
  );
}
