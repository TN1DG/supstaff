import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { hasRole } from "@/lib/roles";
import { shiftLabel } from "@/lib/handover-payload";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { StartHandoverForm } from "./start-form";

export const metadata: Metadata = { title: "Handovers" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function HandoversPage({
  searchParams,
}: PageProps<"/handovers">) {
  const staff = await requireStaff();
  const db = getDb();
  const isManager = hasRole(staff.role, "manager");
  const sp = await searchParams;

  const shiftFilter =
    typeof sp.shift === "string" &&
    ["early", "late", "night"].includes(sp.shift)
      ? (sp.shift as "early" | "late" | "night")
      : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const incidentsOnly = sp.incidents === "1";

  const list = await db.query.handovers.findMany({
    where: and(
      eq(handovers.siteId, staff.siteId),
      shiftFilter ? eq(handovers.shift, shiftFilter) : undefined,
      from ? gte(handovers.handoverDate, from) : undefined,
      to ? lte(handovers.handoverDate, to) : undefined,
    ),
    orderBy: [desc(handovers.handoverDate), desc(handovers.createdAt)],
    limit: 60,
    with: {
      startedBy: { columns: { name: true } },
      entries: { columns: { incidentFlag: true } },
      acknowledgements: { columns: { id: true } },
    },
  });

  const rows = list
    .map((h) => ({
      ...h,
      incidents: h.entries.filter((e) => e.incidentFlag).length,
    }))
    .filter((h) => (incidentsOnly ? h.incidents > 0 : true));

  // Start-of-shift: outstanding tasks from the most recent submitted handover.
  const lastSubmitted = await db.query.handovers.findFirst({
    where: and(
      eq(handovers.siteId, staff.siteId),
      eq(handovers.status, "submitted"),
    ),
    orderBy: [desc(handovers.submittedAt)],
    with: {
      startedBy: { columns: { name: true } },
      entries: {
        where: (e, { and: a, isNotNull, ne }) =>
          a(isNotNull(e.tasksOutstanding), ne(e.tasksOutstanding, "")),
        with: { resident: { columns: { firstName: true, lastName: true, preferredName: true } } },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Handovers"
        description="Shift notes for the team — written once, kept for the manager, ready for Salesforce."
      >
        {isManager ? (
          <Button variant="outline" asChild>
            <Link
              href={{ pathname: "/handovers/export", query: sp as Record<string, string> }}
            >
              Export CSV
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Start a handover</CardTitle>
        </CardHeader>
        <CardContent>
          <StartHandoverForm today={todayISO()} />
        </CardContent>
      </Card>

      {lastSubmitted && lastSubmitted.entries.length > 0 ? (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">
              Outstanding from the last handover
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">
              {shiftLabel(lastSubmitted.shift)} shift ·{" "}
              {lastSubmitted.startedBy.name}
            </p>
            <ul className="space-y-1.5">
              {lastSubmitted.entries.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">
                    {e.resident.preferredName ?? e.resident.firstName}{" "}
                    {e.resident.lastName}:
                  </span>{" "}
                  {e.tasksOutstanding}
                </li>
              ))}
            </ul>
            <Link
              href={`/handovers/${lastSubmitted.id}`}
              className="inline-block text-primary underline"
            >
              Open that handover
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {isManager ? (
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-md border bg-background px-2"
          />
          <span className="self-center text-muted-foreground">to</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-md border bg-background px-2"
          />
          <select
            name="shift"
            defaultValue={shiftFilter ?? ""}
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="">All shifts</option>
            <option value="early">Early</option>
            <option value="late">Late</option>
            <option value="night">Night</option>
          </select>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              name="incidents"
              value="1"
              defaultChecked={incidentsOnly}
            />
            Incidents only
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Started by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Incidents</TableHead>
              <TableHead>Read</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No handovers yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    <Link href={`/handovers/${h.id}`} className="hover:underline">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(h.handoverDate))}
                    </Link>
                  </TableCell>
                  <TableCell>{shiftLabel(h.shift)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.startedBy.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={h.status === "draft" ? "outline" : "secondary"}>
                      {h.status === "draft" ? "Draft" : "Submitted"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {h.incidents > 0 ? (
                      <Badge className="border-destructive/40 bg-destructive/10 text-destructive">
                        {h.incidents}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.status === "draft" ? "—" : h.acknowledgements.length}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
