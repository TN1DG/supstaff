import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Info } from "lucide-react";
import { getDb } from "@/db";
import { staff as staffTable, type StaffRole } from "@/db/schema";
import { requireRole, ROLE_LABEL } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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

/** Distinct, non-alert chip per role — not a "situation", so plain Badge variants rather than a tone. */
const ROLE_BADGE_CLASS: Record<StaffRole, string> = {
  manager: "border-primary/50 bg-primary/10 text-primary",
  support_officer: "border-border bg-secondary text-secondary-foreground",
  bank_staff: "border-accent/50 bg-accent/20 text-accent-foreground",
};

const ENGAGEMENT_WARNING_DAYS = 14;

export default async function StaffPage() {
  const me = await requireRole("manager");
  const now = new Date();

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
                    <Badge variant="outline" className={ROLE_BADGE_CLASS[s.role]}>
                      {ROLE_LABEL[s.role]}
                    </Badge>
                    {s.isAdmin ? (
                      <Badge variant="outline" className="text-xs">
                        admin
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.active ? (
                      <StatusBadge tone="success">Active</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">Inactive</StatusBadge>
                    )}
                    {!s.pinHash ? (
                      <StatusBadge tone="info" icon={Info}>
                        No PIN set
                      </StatusBadge>
                    ) : null}
                    {s.role === "bank_staff" && s.engagedUntil
                      ? (() => {
                          const endsAt = new Date(`${s.engagedUntil}T23:59:59`);
                          const daysLeft = Math.ceil(
                            (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                          );
                          if (daysLeft < 0) {
                            return <StatusBadge tone="danger">Engagement ended</StatusBadge>;
                          }
                          if (daysLeft <= ENGAGEMENT_WARNING_DAYS) {
                            return <StatusBadge tone="warning">Engagement ends soon</StatusBadge>;
                          }
                          return null;
                        })()
                      : null}
                  </div>
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
