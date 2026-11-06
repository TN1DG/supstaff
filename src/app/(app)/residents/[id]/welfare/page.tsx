import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents, residentWelfarePlans } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { listPolicyVersions } from "@/lib/welfare-queries";
import { residentName } from "@/lib/welfare-snapshot";
import { formatMinutes } from "@/lib/welfare-policy";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { WelfarePlanForm } from "./plan-form";
import { saveWelfarePlan } from "./actions";

export const metadata: Metadata = { title: "Welfare plan" };

export default async function WelfarePlanPage({ params }: PageProps<"/residents/[id]/welfare">) {
  const { id } = await params;
  const staff = await requireRole("support_officer");
  const db = getDb();

  const [resident, plan, versions] = await Promise.all([
    db.query.residents.findFirst({
      where: and(eq(residents.id, id), eq(residents.siteId, staff.siteId)),
      columns: { id: true, firstName: true, lastName: true, preferredName: true, status: true },
    }),
    db.query.residentWelfarePlans.findFirst({
      where: and(eq(residentWelfarePlans.residentId, id), eq(residentWelfarePlans.siteId, staff.siteId)),
      columns: {
        tierKey: true,
        contactMethods: true,
        howToCheck: true,
        residentInvolved: true,
        reviewedAt: true,
      },
    }),
    listPolicyVersions(staff.siteId),
  ]);
  if (!resident || resident.status === "discharged") notFound();
  const current = versions[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Welfare plan · ${residentName(resident)}`}
        description="How often they're checked and how — agreed with them where you can."
      />
      {!current ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            The service&rsquo;s welfare rules need publishing before plans can be set up.
          </CardContent>
        </Card>
      ) : (
        <WelfarePlanForm
          action={saveWelfarePlan.bind(null, id)}
          residentId={id}
          tiers={current.config.tiers.map((t) => ({
            key: t.key,
            name: t.name,
            summary: `At least every ${formatMinutes(t.intervalMinutes)}`,
          }))}
          plan={
            plan
              ? {
                  tierKey: plan.tierKey,
                  contactMethods: plan.contactMethods,
                  howToCheck: plan.howToCheck,
                  residentInvolved: plan.residentInvolved,
                  reviewedAt: plan.reviewedAt?.toISOString() ?? null,
                }
              : null
          }
        />
      )}
    </div>
  );
}
