import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPinForm } from "../account-forms";

export const metadata: Metadata = { title: "Signing PIN" };

export default async function PinPage() {
  const me = await requireStaff();
  const person = await getDb().query.staff.findFirst({
    where: eq(staff.id, me.id),
    columns: { pinHash: true },
  });
  const hasPin = Boolean(person?.pinHash);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Signing PIN"
        description="A short PIN you type to confirm it's you when signing a medication round, completing a night check, or submitting a handover on a shared computer."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {hasPin ? "Update your PIN" : "Set your PIN"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SetPinForm hasPin={hasPin} />
        </CardContent>
      </Card>
    </div>
  );
}
