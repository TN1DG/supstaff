import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { XCircle, AlertTriangle, ShieldCheck, Circle } from "lucide-react";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { DOSE_STATUS_META, isoDate, roundLabel } from "@/lib/medication";
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
import { cdRegisterInRange, missedDosesInRange, reasonTrends, refusalsInRange } from "../queries";

export const metadata: Metadata = { title: "Medication reports" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export default async function MedicationReportsPage({
  searchParams,
}: PageProps<"/medication/reports">) {
  const staffMember = await requireRole("manager");
  const sp = await searchParams;

  const from = typeof sp.from === "string" && sp.from ? sp.from : daysAgo(7);
  const to = typeof sp.to === "string" && sp.to ? sp.to : isoDate(new Date());
  const residentId = typeof sp.residentId === "string" && sp.residentId ? sp.residentId : undefined;

  const [residentList, missed, refusals, cdRows, trends] = await Promise.all([
    getDb().query.residents.findMany({
      where: and(eq(residents.siteId, staffMember.siteId), eq(residents.status, "active")),
      columns: { id: true, firstName: true, lastName: true, preferredName: true },
      orderBy: (t, { asc }) => [asc(t.firstName)],
    }),
    missedDosesInRange(staffMember.siteId, from, to, new Date()),
    refusalsInRange(staffMember.siteId, from, to, residentId),
    cdRegisterInRange(staffMember.siteId, from, to, residentId),
    reasonTrends(staffMember.siteId, from, to),
  ]);

  const exportQuery: Record<string, string> = { kind: "all", from, to };
  if (residentId) exportQuery.residentId = residentId;

  return (
    <>
      <PageHeader
        title="Medication reports"
        description="Missed doses, refusals, the controlled-drug register, and reason trends."
      >
        <Button variant="outline" asChild>
          <Link href={{ pathname: "/medication/reports/export", query: exportQuery }}>
            Export CSV
          </Link>
        </Button>
      </PageHeader>

      <form className="mb-6 flex flex-wrap items-end gap-2 text-sm">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-md border bg-background px-2"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-md border bg-background px-2"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Resident</label>
          <select
            name="residentId"
            defaultValue={residentId ?? ""}
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="">All residents</option>
            {residentList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.preferredName ?? r.firstName} {r.lastName}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
      </form>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <XCircle className="size-4 text-destructive" aria-hidden />
              Missed doses <span className="text-muted-foreground">({missed.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Medication</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No missed doses in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  missed.map((m, i) => (
                    <TableRow key={`${m.medicationId}-${m.date}-${m.round}-${i}`}>
                      <TableCell>{dateFmt.format(new Date(`${m.date}T00:00:00`))}</TableCell>
                      <TableCell>{roundLabel(m.round)}</TableCell>
                      <TableCell>{m.residentName}</TableCell>
                      <TableCell>{m.medicationName}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              Refusals <span className="text-muted-foreground">({refusals.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Medication</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refusals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No refusals in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  refusals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{dateFmt.format(new Date(`${r.scheduledDate}T00:00:00`))}</TableCell>
                      <TableCell>{r.scheduledRound ? roundLabel(r.scheduledRound) : "PRN"}</TableCell>
                      <TableCell>{r.residentName}</TableCell>
                      <TableCell>{r.medicationName}</TableCell>
                      <TableCell>{r.reasonLabel ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.staffName}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <ShieldCheck className="size-4 text-accent-foreground" aria-hidden />
              Controlled drug register{" "}
              <span className="text-muted-foreground">({cdRows.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Medication</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Witness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cdRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No controlled-drug activity in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  cdRows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{dateFmt.format(new Date(`${c.scheduledDate}T00:00:00`))}</TableCell>
                      <TableCell>{c.scheduledRound ? roundLabel(c.scheduledRound) : "PRN"}</TableCell>
                      <TableCell>{c.residentName}</TableCell>
                      <TableCell>{c.medicationName}</TableCell>
                      <TableCell>
                        <StatusBadge tone={DOSE_STATUS_META[c.outcome].tone}>
                          {DOSE_STATUS_META[c.outcome].label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.staffName}</TableCell>
                      <TableCell className="text-muted-foreground">{c.witnessName ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Circle className="size-4 text-muted-foreground" aria-hidden />
              Trends — non-given outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">By reason</p>
              {trends.byReason.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to show.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {trends.byReason.map(([label, count]) => (
                    <li key={label} className="flex justify-between">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">By medication</p>
              {trends.byMedication.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to show.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {trends.byMedication.map(([label, count]) => (
                    <li key={label} className="flex justify-between">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6">
        <Link href="/medication" className="text-sm text-primary underline">
          Back to medication
        </Link>
      </p>
    </>
  );
}
