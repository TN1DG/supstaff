import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { maintenanceReports } from "@/db/schema";
import { canManageBuilding, requireStaff } from "@/lib/rbac";
import {
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
} from "@/lib/maintenance";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report an issue" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MaintenancePage() {
  const staff = await requireStaff();

  const mine = await getDb().query.maintenanceReports.findMany({
    where: and(
      eq(maintenanceReports.siteId, staff.siteId),
      eq(maintenanceReports.reportedByStaffId, staff.id),
    ),
    columns: {
      id: true,
      title: true,
      location: true,
      category: true,
      priority: true,
      status: true,
      createdAt: true,
    },
    orderBy: [desc(maintenanceReports.createdAt)],
    limit: 10,
  });

  const manages = canManageBuilding(staff.role);

  return (
    <>
      <PageHeader
        title="Report an issue"
        description="Log repairs, hazards and maintenance from the floor. The housing officer picks it up and it's forwarded to Saw-it."
      >
        {manages ? (
          <Button variant="outline" asChild>
            <Link href="/building">Building dashboard</Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New report</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your recent reports</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged yet. Anything you report shows here with its progress.
              </p>
            ) : (
              <ul className="divide-y">
                {mine.map((r) => {
                  const status = MAINTENANCE_STATUS_META[r.status];
                  const priority = MAINTENANCE_PRIORITY_META[r.priority];
                  const title = manages ? (
                    <Link href={`/building/${r.id}`} className="hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  );
                  return (
                    <li key={r.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{title}</p>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.location} · {MAINTENANCE_CATEGORY_LABEL[r.category]} ·{" "}
                        {dateFmt.format(r.createdAt)}
                        {r.priority === "high" || r.priority === "urgent"
                          ? ` · ${priority.label}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
