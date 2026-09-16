import type { Metadata } from "next";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Lock } from "lucide-react";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { categorizeAuditAction } from "@/lib/audit-tone";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

export default async function AuditPage({
  searchParams,
}: PageProps<"/audit">) {
  const me = await requireRole("manager");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const where = and(
    eq(auditLog.siteId, me.siteId),
    q
      ? or(
          ilike(auditLog.action, `%${q}%`),
          ilike(auditLog.entityType, `%${q}%`),
          ilike(auditLog.actorName, `%${q}%`),
        )
      : undefined,
  );

  const rows = await getDb().query.auditLog.findMany({
    where,
    orderBy: [desc(auditLog.at)],
    limit: PAGE_SIZE,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every recorded action, with who did it and when. Append-only."
      />

      <form className="mb-4 max-w-xs">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Filter by action, person or type…"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nothing logged yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(r.at)}
                  </TableCell>
                  <TableCell>{r.actorName ?? "System"}</TableCell>
                  <TableCell>
                    {(() => {
                      const tone = categorizeAuditAction(r.action);
                      return (
                        <StatusBadge
                          tone={tone}
                          icon={tone === "danger" ? Lock : undefined}
                          className="font-mono text-xs"
                        >
                          {r.action}
                        </StatusBadge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.entityType}
                    {r.entityId ? (
                      <span className="ml-1 font-mono text-xs">
                        {r.entityId.slice(0, 8)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.ip ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {rows.length === PAGE_SIZE ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the most recent {PAGE_SIZE} entries. Narrow with the filter
          above.
        </p>
      ) : null}
    </>
  );
}
