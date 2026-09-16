import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/rbac";
import { hasRole } from "@/lib/roles";
import {
  MEDICATION_ROUNDS,
  displayDoseStatus,
  isoDate,
  medicationRoundScheduledAt,
} from "@/lib/medication";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dueDosesForRound, prnMedications } from "./queries";

export const metadata: Metadata = { title: "Medication" };

export default async function MedicationPage() {
  const staffMember = await requireStaff();
  const isManager = hasRole(staffMember.role, "manager");
  const now = new Date();
  const today = isoDate(now);

  const [roundDoses, prnMeds] = await Promise.all([
    Promise.all(
      MEDICATION_ROUNDS.map((r) => dueDosesForRound(staffMember.siteId, r.round, now)),
    ),
    prnMedications(staffMember.siteId, now),
  ]);

  return (
    <>
      <PageHeader
        title="Medication"
        description="Round-by-round MAR — every dose signed, every controlled drug witnessed."
      >
        {isManager ? (
          <>
            <Button variant="outline" asChild>
              <Link href="/medication/reason-codes">Reason codes</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/medication/reports">Reports</Link>
            </Button>
          </>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MEDICATION_ROUNDS.map((r, idx) => {
          const doses = roundDoses[idx];
          const given = doses.filter((d) => d.administration).length;
          const scheduledAt = medicationRoundScheduledAt(today, r.round);
          const overdue = doses.filter(
            (d) =>
              !d.administration &&
              displayDoseStatus(scheduledAt, null, now, today, r.round) === "missed",
          ).length;
          return (
            <Link key={r.round} href={`/medication/${r.round}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/30">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {r.label}
                    <span className="text-xs font-normal text-muted-foreground">{r.time}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    {given} of {doses.length} given
                  </p>
                  {overdue > 0 ? (
                    <StatusBadge tone="danger">{overdue} overdue</StatusBadge>
                  ) : doses.length === 0 ? (
                    <p className="text-muted-foreground">Nothing scheduled</p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">PRN (as-needed)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            {prnMeds.length} PRN medication{prnMeds.length === 1 ? "" : "s"} available across
            the house.
          </p>
          <Link href="/medication/prn-doses" className="mt-2 inline-block text-primary underline">
            Go to PRN medications
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
