import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireStaff, hasRole } from "@/lib/rbac";
import { RESIDENT_STATUS_META, riskFlagDescription } from "@/lib/residents";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TooltipStatusBadge } from "@/components/tooltip-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Residents" };

export default async function ResidentsPage() {
  const staff = await requireStaff();
  const db = getDb();

  const rows = await db.query.residents.findMany({
    where: eq(residents.siteId, staff.siteId),
    orderBy: [asc(residents.lastName), asc(residents.firstName)],
    with: { keyWorker: { columns: { name: true } } },
  });

  const canEdit = hasRole(staff.role, "support_officer");

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone the team supports in this house."
      >
        {canEdit ? (
          <Button asChild>
            <Link href="/residents/new">Add resident</Link>
          </Button>
        ) : null}
      </PageHeader>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No residents yet.
          {canEdit ? (
            <>
              {" "}
              <Link href="/residents/new" className="text-primary underline">
                Add the first one
              </Link>
              .
            </>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Key worker</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/residents/${r.id}`} className="hover:underline">
                      {r.preferredName
                        ? `${r.preferredName} (${r.firstName}) ${r.lastName}`
                        : `${r.firstName} ${r.lastName}`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.room ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.keyWorker?.name ?? (
                      <span className="text-accent-foreground">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.riskFlags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        r.riskFlags.map((f) => (
                          <TooltipStatusBadge key={f} tone="warning" tooltip={riskFlagDescription(f)}>
                            {f}
                          </TooltipStatusBadge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={RESIDENT_STATUS_META[r.status].tone}>
                      {RESIDENT_STATUS_META[r.status].label}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
