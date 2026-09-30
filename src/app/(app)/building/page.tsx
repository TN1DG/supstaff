import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ClipboardList, MoonStar, Tags } from "lucide-react";
import { requireBuildingManager } from "@/lib/rbac";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_META,
  daysBetween,
} from "@/lib/maintenance";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { raiseFromFinding } from "./actions";
import {
  categoryBreakdown,
  nightCheckFindings,
  parseFilters,
  reportKpis,
  reportsInRange,
} from "./queries";

export const metadata: Metadata = { title: "Building dashboard" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warning" | "danger";
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={
            tone === "danger"
              ? "text-2xl font-semibold text-destructive"
              : tone === "warning"
                ? "text-2xl font-semibold text-warning"
                : "text-2xl font-semibold"
          }
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

const selectClass = "h-9 rounded-md border bg-background px-2";

export default async function BuildingDashboardPage({
  searchParams,
}: PageProps<"/building">) {
  const staff = await requireBuildingManager();
  const filters = parseFilters(await searchParams);
  const { from, to } = filters;

  const [reports, kpis, categories, findings] = await Promise.all([
    reportsInRange(staff.siteId, filters),
    reportKpis(staff.siteId, from, to),
    categoryBreakdown(staff.siteId, from, to),
    nightCheckFindings(staff.siteId, from, to),
  ]);

  const unraised = findings.filter((f) => !f.reportId).length;
  const maxCategory = Math.max(1, ...categories.map((c) => c.total));
  const now = new Date();

  const exportQuery: Record<string, string> = { from, to };
  for (const k of ["status", "priority", "category", "q"] as const) {
    if (filters[k]) exportQuery[k] = filters[k];
  }

  return (
    <>
      <PageHeader
        title="Building dashboard"
        description="Every building report and night-check finding in one place — triage, track and export."
      >
        <Button variant="outline" asChild>
          <Link href={{ pathname: "/building/export", query: exportQuery }}>Export CSV</Link>
        </Button>
        <Button asChild>
          <Link href="/maintenance">Log an issue</Link>
        </Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open now" value={kpis.open} hint="Not yet resolved" />
        <Kpi
          label="High / urgent open"
          value={kpis.highOrUrgentOpen}
          tone={kpis.highOrUrgentOpen > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Oldest open"
          value={kpis.oldestOpenDays == null ? "—" : `${kpis.oldestOpenDays}d`}
          tone={kpis.oldestOpenDays != null && kpis.oldestOpenDays > 14 ? "warning" : undefined}
        />
        <Kpi label="Reported in range" value={kpis.createdInRange} />
        <Kpi
          label="Resolved in range"
          value={kpis.resolvedInRange}
          hint={
            kpis.avgDaysToResolve == null
              ? undefined
              : `Avg ${kpis.avgDaysToResolve.toFixed(1)} days to fix`
          }
        />
        <Kpi
          label="Night-check findings"
          value={unraised}
          hint="Not yet raised as a report"
          tone={unraised > 0 ? "warning" : undefined}
        />
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-2 text-sm">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">From</label>
          <input type="date" name="from" defaultValue={from} className={selectClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">To</label>
          <input type="date" name="to" defaultValue={to} className={selectClass} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Status</label>
          <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">Any status</option>
            <option value="unresolved">Not resolved</option>
            {MAINTENANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Priority</label>
          <select name="priority" defaultValue={filters.priority ?? ""} className={selectClass}>
            <option value="">Any priority</option>
            {MAINTENANCE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {MAINTENANCE_PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Category</label>
          <select name="category" defaultValue={filters.category ?? ""} className={selectClass}>
            <option value="">Any category</option>
            {MAINTENANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MAINTENANCE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Search</label>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Title, location, contractor"
            className={`${selectClass} w-56`}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/building">Reset</Link>
        </Button>
      </form>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
              Reports <span className="text-muted-foreground">({reports.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reported</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>With</TableHead>
                  <TableHead>Reported by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No reports match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((r) => {
                    const status = MAINTENANCE_STATUS_META[r.status];
                    const priority = MAINTENANCE_PRIORITY_META[r.priority];
                    const age = daysBetween(r.createdAt, r.resolvedAt ?? now);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          {dateFmt.format(r.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-72 truncate font-medium">
                          <Link href={`/building/${r.id}`} className="hover:underline">
                            {r.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {r.location}
                          {r.roomNumber ? (
                            <span className="text-muted-foreground"> · Rm {r.roomNumber}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{MAINTENANCE_CATEGORY_LABEL[r.category]}</TableCell>
                        <TableCell>
                          <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{age}d</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.assignedTo ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.reportedBy?.name ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Tags className="size-4 text-muted-foreground" aria-hidden />
                By category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reports in this range.</p>
              ) : (
                <ul className="space-y-3">
                  {categories.map((c) => (
                    <li key={c.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{MAINTENANCE_CATEGORY_LABEL[c.category]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {c.total}
                          {c.unresolved > 0 ? ` · ${c.unresolved} open` : ""}
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-warning"
                          style={{ width: `${(c.unresolved / maxCategory) * 100}%` }}
                        />
                        <div
                          className="bg-primary"
                          style={{
                            width: `${((c.total - c.unresolved) / maxCategory) * 100}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-warning" /> Open
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-primary" /> Resolved
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-base">
                <MoonStar className="size-4 text-muted-foreground" aria-hidden />
                Night-check findings{" "}
                <span className="text-muted-foreground">({findings.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Night</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No building items flagged on night checks in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    findings.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap">
                          {dateFmt.format(new Date(`${f.checkDate}T00:00:00`))} · {f.roundTime}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{f.area}</span>
                          <span className="block text-xs text-muted-foreground">
                            {f.description}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-56 text-muted-foreground">
                          {f.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {f.staffName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.reportId && f.reportStatus ? (
                            <Link href={`/building/${f.reportId}`}>
                              <StatusBadge tone={MAINTENANCE_STATUS_META[f.reportStatus].tone}>
                                {MAINTENANCE_STATUS_META[f.reportStatus].label}
                              </StatusBadge>
                            </Link>
                          ) : (
                            <form action={raiseFromFinding.bind(null, f.id)}>
                              <Button type="submit" size="sm" variant="outline">
                                <Building2 aria-hidden />
                                Raise report
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
