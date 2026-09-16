import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nightCheckSituationTypes, nightCheckTemplateItems } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AddItemDialog, EditItemDialog } from "./template-item-dialogs";
import { ItemRowActions } from "./item-row-actions";
import { AddSituationTypeDialog, EditSituationTypeDialog } from "./situation-type-dialogs";
import { SituationRowActions } from "./situation-row-actions";

export const metadata: Metadata = { title: "Night check checklist" };

export default async function NightCheckTemplatePage() {
  const staffMember = await requireRole("manager");
  const db = getDb();

  const [items, situationTypes] = await Promise.all([
    db.query.nightCheckTemplateItems.findMany({
      where: eq(nightCheckTemplateItems.siteId, staffMember.siteId),
      orderBy: [asc(nightCheckTemplateItems.sortOrder), asc(nightCheckTemplateItems.createdAt)],
    }),
    db.query.nightCheckSituationTypes.findMany({
      where: eq(nightCheckSituationTypes.siteId, staffMember.siteId),
      orderBy: [asc(nightCheckSituationTypes.sortOrder), asc(nightCheckSituationTypes.createdAt)],
    }),
  ]);
  const active = items.filter((i) => i.active);
  const archived = items.filter((i) => !i.active);
  const activeSituations = situationTypes.filter((s) => s.active);
  const archivedSituations = situationTypes.filter((s) => !s.active);

  return (
    <>
      <PageHeader
        title="Night check checklist"
        description="What staff walk through on every round. Changes apply to rounds checked in from now on."
      >
        <AddItemDialog />
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="divide-y pt-6">
          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No checklist items yet.
            </p>
          ) : (
            active.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{item.area}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  <ItemRowActions
                    id={item.id}
                    active
                    isFirst={idx === 0}
                    isLast={idx === active.length - 1}
                  />
                  <EditItemDialog id={item.id} area={item.area} description={item.description} />
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
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-muted-foreground">{item.area}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <ItemRowActions id={item.id} active={false} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <PageHeader
        title="Welfare situations"
        description="What staff can flag per room during the resident-welfare check."
      >
        <AddSituationTypeDialog />
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="divide-y pt-6">
          {activeSituations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No situation types yet.
            </p>
          ) : (
            activeSituations.map((s, idx) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <p className="font-medium">{s.label}</p>
                <div className="flex items-center gap-1">
                  <SituationRowActions
                    id={s.id}
                    active
                    isFirst={idx === 0}
                    isLast={idx === activeSituations.length - 1}
                  />
                  <EditSituationTypeDialog id={s.id} label={s.label} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {archivedSituations.length > 0 ? (
        <Card>
          <CardContent className="divide-y pt-6">
            <p className="pb-2 text-sm font-medium text-muted-foreground">Archived</p>
            {archivedSituations.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-medium text-muted-foreground">{s.label}</p>
                <SituationRowActions id={s.id} active={false} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6">
        <Link href="/night-checks" className="text-sm text-primary underline">
          Back to night checks
        </Link>
      </p>
    </>
  );
}
