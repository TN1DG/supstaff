import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { medicationReasonCodes } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AddReasonCodeDialog, EditReasonCodeDialog } from "./reason-code-dialogs";
import { ReasonCodeRowActions } from "./reason-code-row-actions";

export const metadata: Metadata = { title: "Medication reason codes" };

export default async function ReasonCodesPage() {
  const staffMember = await requireRole("manager");
  const db = getDb();

  const items = await db.query.medicationReasonCodes.findMany({
    where: eq(medicationReasonCodes.siteId, staffMember.siteId),
    orderBy: [asc(medicationReasonCodes.sortOrder), asc(medicationReasonCodes.createdAt)],
  });
  const active = items.filter((i) => i.active);
  const archived = items.filter((i) => !i.active);

  return (
    <>
      <PageHeader
        title="Medication reason codes"
        description="Shown whenever a dose is recorded as anything other than given."
      >
        <AddReasonCodeDialog />
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="divide-y pt-6">
          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No reason codes yet.
            </p>
          ) : (
            active.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <p className="font-medium">{item.label}</p>
                <div className="flex items-center gap-1">
                  <ReasonCodeRowActions
                    id={item.id}
                    active
                    isFirst={idx === 0}
                    isLast={idx === active.length - 1}
                  />
                  <EditReasonCodeDialog id={item.id} label={item.label} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {archived.length > 0 ? (
        <Card>
          <CardContent className="divide-y pt-6">
            <p className="pb-2 text-sm font-medium text-muted-foreground">Archived</p>
            {archived.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-medium text-muted-foreground">{item.label}</p>
                <ReasonCodeRowActions id={item.id} active={false} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6">
        <Link href="/medication" className="text-sm text-primary underline">
          Back to medication
        </Link>
      </p>
    </>
  );
}
