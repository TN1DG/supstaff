import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { ArrowRight, MoonStar } from "lucide-react";
import { getDb } from "@/db";
import { maintenanceReports, maintenanceReportUpdates } from "@/db/schema";
import { requireBuildingManager } from "@/lib/rbac";
import { bySite } from "@/lib/db-scope";
import {
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUS_META,
  daysBetween,
} from "@/lib/maintenance";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateReport } from "../actions";
import { TriageForm } from "./triage-form";

export const metadata: Metadata = { title: "Building report" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function BuildingReportPage({ params }: PageProps<"/building/[id]">) {
  const staff = await requireBuildingManager();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const report = await getDb().query.maintenanceReports.findFirst({
    where: bySite(maintenanceReports, id, staff.siteId),
    with: {
      reportedBy: { columns: { name: true } },
      resolvedBy: { columns: { name: true } },
      updates: {
        with: { staff: { columns: { name: true } } },
        orderBy: [asc(maintenanceReportUpdates.createdAt)],
      },
    },
  });
  if (!report) notFound();

  const status = MAINTENANCE_STATUS_META[report.status];
  const priority = MAINTENANCE_PRIORITY_META[report.priority];
  const age = daysBetween(report.createdAt, report.resolvedAt ?? new Date());

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${report.location}${report.roomNumber ? ` · Room ${report.roomNumber}` : ""} · ${MAINTENANCE_CATEGORY_LABEL[report.category]}`}
      >
        <Button variant="outline" asChild>
          <Link href="/building">Back to dashboard</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <StatusBadge tone={priority.tone}>{priority.label} priority</StatusBadge>
                {report.sourceItemResultId ? (
                  <StatusBadge tone="neutral" icon={MoonStar}>
                    From night check
                  </StatusBadge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.description ? (
                <p className="whitespace-pre-wrap text-sm">{report.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No further details given.</p>
              )}
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Reported">{dateTimeFmt.format(report.createdAt)}</Field>
                <Field label="Reported by">{report.reportedBy?.name ?? "—"}</Field>
                <Field label={report.resolvedAt ? "Took" : "Open for"}>
                  {age} {age === 1 ? "day" : "days"}
                </Field>
                <Field label="Acknowledged">
                  {report.acknowledgedAt ? dateTimeFmt.format(report.acknowledgedAt) : "—"}
                </Field>
                <Field label="Resolved">
                  {report.resolvedAt
                    ? `${dateTimeFmt.format(report.resolvedAt)}${report.resolvedBy ? ` · ${report.resolvedBy.name}` : ""}`
                    : "—"}
                </Field>
                <Field label="With">{report.assignedTo ?? "—"}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 border-l pl-4">
                {report.updates.map((u) => (
                  <li key={u.id} className="space-y-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      {u.fromStatus && u.fromStatus !== u.toStatus ? (
                        <>
                          <span className="text-muted-foreground">
                            {MAINTENANCE_STATUS_META[u.fromStatus].label}
                          </span>
                          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                          <span className="font-medium">
                            {MAINTENANCE_STATUS_META[u.toStatus].label}
                          </span>
                        </>
                      ) : u.fromStatus ? (
                        <span className="font-medium">Updated</span>
                      ) : (
                        <span className="font-medium">Reported</span>
                      )}
                    </p>
                    {u.note ? <p className="whitespace-pre-wrap text-sm">{u.note}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {u.staff?.name ?? "Unknown"} · {dateTimeFmt.format(u.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Triage</CardTitle>
          </CardHeader>
          <CardContent>
            <TriageForm
              action={updateReport.bind(null, report.id)}
              report={{
                status: report.status,
                priority: report.priority,
                assignedTo: report.assignedTo,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
