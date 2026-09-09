import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff as staffTable } from "@/db/schema";
import { requireRole, ROLE_LABEL } from "@/lib/rbac";
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

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const me = await requireRole("manager");

  const rows = await getDb().query.staff.findMany({
    where: eq(staffTable.siteId, me.siteId),
    orderBy: [asc(staffTable.name)],
  });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Accounts for everyone who works in this house."
      >
        <Button asChild>
          <Link href="/staff/new">Add staff</Link>
        </Button>
      </PageHeader>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link href={`/staff/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                  {s.id === me.id ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      you
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.email}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    {ROLE_LABEL[s.role]}
                    {s.isAdmin ? (
                      <Badge variant="outline" className="text-xs">
                        admin
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  {s.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 text-destructive"
                    >
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.lastLoginAt
                    ? new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(s.lastLoginAt)
                    : "Never"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
