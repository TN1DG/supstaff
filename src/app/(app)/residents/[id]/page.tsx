import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { requireStaff, hasRole } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveResidentButton } from "./archive-button";

export const metadata: Metadata = { title: "Resident" };

const STATUS_LABEL: Record<string, string> = {
  active: "In the house",
  on_leave: "On leave",
  discharged: "Discharged",
};

export default async function ResidentPage({
  params,
}: PageProps<"/residents/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();

  const resident = await getDb().query.residents.findFirst({
    where: and(eq(residents.id, id), eq(residents.siteId, staff.siteId)),
    with: { keyWorker: { columns: { name: true } } },
  });
  if (!resident) notFound();

  const canEdit = hasRole(staff.role, "support_officer");
  const isManager = hasRole(staff.role, "manager");
  const displayName = resident.preferredName
    ? `${resident.preferredName} ${resident.lastName}`
    : `${resident.firstName} ${resident.lastName}`;

  return (
    <>
      <PageHeader title={displayName} description={`Room ${resident.room ?? "—"}`}>
        {canEdit ? (
          <Button variant="outline" asChild>
            <Link href={`/residents/${resident.id}/edit`}>Edit</Link>
          </Button>
        ) : null}
        {isManager && resident.status !== "discharged" ? (
          <ArchiveResidentButton id={resident.id} name={displayName} />
        ) : null}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Full name">
              {resident.firstName} {resident.lastName}
            </Row>
            <Row label="Date of birth">{resident.dateOfBirth ?? "—"}</Row>
            <Row label="Admitted">{resident.admissionDate ?? "—"}</Row>
            <Row label="Key worker">{resident.keyWorker?.name ?? "Not assigned"}</Row>
            <Row label="Status">
              <Badge variant="secondary">{STATUS_LABEL[resident.status]}</Badge>
            </Row>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Risk flags</CardTitle>
          </CardHeader>
          <CardContent>
            {resident.riskFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {resident.riskFlags.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="border-warning/50 bg-warning/10 text-warning-foreground"
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Support notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {resident.supportNotes || "No notes yet."}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
