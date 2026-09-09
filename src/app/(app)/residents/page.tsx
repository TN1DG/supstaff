import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireStaff, hasRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Residents" };

const STATUS_LABEL: Record<string, string> = {
  active: "In the house",
  on_leave: "On leave",
  discharged: "Discharged",
};

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
                    {r.keyWorker?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.riskFlags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        r.riskFlags.map((f) => (
                          <Badge
                            key={f}
                            variant="outline"
                            className="border-warning/50 bg-warning/10 text-warning-foreground"
                          >
                            {f}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "active" ? "secondary" : "outline"}
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
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
