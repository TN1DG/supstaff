import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { medicationReasonCodes } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { listActiveStaff } from "@/lib/queries";
import {
  DOSE_STATUS_META,
  displayDoseStatus,
  isMedicationRound,
  isoDate,
  medicationRoundScheduledAt,
  roundLabel,
} from "@/lib/medication";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecordDoseDialog } from "../record-dose-dialog";
import { dueDosesForRound } from "../queries";

export async function generateMetadata({
  params,
}: PageProps<"/medication/[round]">): Promise<Metadata> {
  const { round } = await params;
  return { title: isMedicationRound(round) ? `${roundLabel(round)} round` : "Medication" };
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export default async function MedicationRoundPage({
  params,
}: PageProps<"/medication/[round]">) {
  const { round } = await params;
  if (!isMedicationRound(round)) notFound();

  const staffMember = await requireStaff();
  const now = new Date();
  const today = isoDate(now);
  const scheduledAt = medicationRoundScheduledAt(today, round);

  const [doses, reasonCodes, staffOptions] = await Promise.all([
    dueDosesForRound(staffMember.siteId, round, now),
    getDb().query.medicationReasonCodes.findMany({
      where: and(
        eq(medicationReasonCodes.siteId, staffMember.siteId),
        eq(medicationReasonCodes.active, true),
      ),
      orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
      columns: { id: true, label: true },
    }),
    listActiveStaff(staffMember.siteId),
  ]);

  return (
    <>
      <PageHeader
        title={`${roundLabel(round)} round`}
        description={`${timeFmt.format(scheduledAt)} · ${doses.length} due today`}
      />

      <Card>
        <CardContent className="divide-y pt-6">
          {doses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing scheduled for this round today.
            </p>
          ) : (
            doses.map((d) => {
              const status = d.administration
                ? d.administration.outcome
                : displayDoseStatus(scheduledAt, null, now, today, round);
              return (
                <div
                  key={d.medicationId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">
                      {d.residentName}
                      {d.isControlledDrug ? (
                        <StatusBadge tone="info" icon={ShieldCheck} className="ml-2">
                          CD
                        </StatusBadge>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {d.medicationName}
                      {d.strength ? ` ${d.strength}` : ""}
                      {d.form ? ` · ${d.form}` : ""}
                    </p>
                    {d.administration ? (
                      <p className="text-xs text-muted-foreground">
                        {d.administration.staffName} ·{" "}
                        {timeFmt.format(d.administration.administeredAt)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={DOSE_STATUS_META[status].tone}>
                      {DOSE_STATUS_META[status].label}
                    </StatusBadge>
                    {!d.administration ? (
                      <RecordDoseDialog
                        medicationId={d.medicationId}
                        residentId={d.residentId}
                        scheduledRound={round}
                        medicationLabel={`${d.medicationName}${d.strength ? ` ${d.strength}` : ""}`}
                        residentName={d.residentName}
                        isControlledDrug={d.isControlledDrug}
                        isPrn={false}
                        reasonCodes={reasonCodes}
                        staffOptions={staffOptions}
                        currentStaffId={staffMember.id}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <p className="mt-6 flex gap-4">
        <Link href="/medication" className="text-sm text-primary underline">
          Back to medication
        </Link>
        <Link href="/medication/prn-doses" className="text-sm text-primary underline">
          PRN medications
        </Link>
      </p>
    </>
  );
}
