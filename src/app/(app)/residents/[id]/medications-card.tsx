import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { medications } from "@/db/schema";
import { roundLabel } from "@/lib/medication";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MedicationRowActions } from "./medication-row-actions";

export async function MedicationsCard({
  residentId,
  siteId,
  canEdit,
  isManager,
}: {
  residentId: string;
  siteId: string;
  canEdit: boolean;
  isManager: boolean;
}) {
  const meds = await getDb().query.medications.findMany({
    where: and(eq(medications.residentId, residentId), eq(medications.siteId, siteId)),
    with: { schedules: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  const active = meds.filter((m) => m.active);
  const archived = meds.filter((m) => !m.active);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Medications</CardTitle>
        {canEdit ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/residents/${residentId}/medication/new`}>Add medication</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="divide-y">
        {active.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No active medications.</p>
        ) : (
          active.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium">
                  {m.name}
                  {m.strength ? ` ${m.strength}` : ""}
                  {m.isControlledDrug ? (
                    <StatusBadge tone="info" icon={ShieldCheck} className="ml-2">
                      CD
                    </StatusBadge>
                  ) : null}
                  {m.isPrn ? (
                    <Badge className="ml-2" variant="outline">
                      PRN
                    </Badge>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[m.route, m.directions].filter(Boolean).join(" · ") || "No directions recorded"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.isPrn
                    ? m.prnReason ?? "As needed"
                    : m.schedules.map((s) => roundLabel(s.roundSlot)).join(", ") ||
                      "No schedule set"}
                </p>
                {m.updatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last edited {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(m.updatedAt)}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                {canEdit ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/residents/${residentId}/medication/${m.id}/edit`}>Edit</Link>
                  </Button>
                ) : null}
                {isManager ? <MedicationRowActions id={m.id} active /> : null}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {isManager && archived.length > 0 ? (
        <CardContent className="divide-y border-t pt-4">
          <p className="pb-2 text-sm font-medium text-muted-foreground">Archived</p>
          {archived.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="font-medium text-muted-foreground">
                {m.name}
                {m.strength ? ` ${m.strength}` : ""}
              </p>
              <MedicationRowActions id={m.id} active={false} />
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
