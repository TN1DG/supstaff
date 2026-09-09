import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { requireStaff, ROLE_LABEL } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const me = await requireStaff();
  const person = await getDb().query.staff.findFirst({
    where: eq(staff.id, me.id),
    columns: { name: true, email: true, role: true, phone: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Your account" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name:</span> {person?.name}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {person?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Role:</span>{" "}
            {person ? ROLE_LABEL[person.role] : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Ask your manager to change your name, email or role.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
