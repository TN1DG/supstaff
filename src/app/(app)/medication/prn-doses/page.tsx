import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { medicationReasonCodes } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { listActiveStaff } from "@/lib/queries";
import { DOSE_STATUS_META, checkPrnSafety } from "@/lib/medication";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { RecordDoseDialog } from "../record-dose-dialog";
import { PrnEffectNoteDialog } from "../prn-effect-note-dialog";
import { prnMedications } from "../queries";

export const metadata: Metadata = { title: "PRN medications" };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export default async function MedicationPrnPage() {
  const staffMember = await requireStaff();
  const now = new Date();

  const [meds, reasonCodes, staffOptions] = await Promise.all([
    prnMedications(staffMember.siteId, now),
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
        title="PRN medications"
        description="As-needed medications — available any time, not tied to a round."
      />

      {meds.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No PRN medications set up.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {meds.map((m) => {
            const givenToday = m.dosesToday.filter((d) => d.outcome === "given");
            const { warning } = checkPrnSafety(
              { prnMaxDosePerDay: m.prnMaxDosePerDay, prnMinIntervalMinutes: m.prnMinIntervalMinutes },
              givenToday,
              now,
            );
            return (
              <Card key={m.medicationId}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {m.residentName}
                        {m.isControlledDrug ? (
                          <StatusBadge tone="info" icon={ShieldCheck} className="ml-2">
                            CD
                          </StatusBadge>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {m.medicationName}
                        {m.strength ? ` ${m.strength}` : ""}
                        {m.form ? ` · ${m.form}` : ""}
                      </p>
                      {m.prnReason ? (
                        <p className="text-xs text-muted-foreground">For: {m.prnReason}</p>
                      ) : null}
                    </div>
                    <RecordDoseDialog
                      medicationId={m.medicationId}
                      residentId={m.residentId}
                      scheduledRound={null}
                      medicationLabel={`${m.medicationName}${m.strength ? ` ${m.strength}` : ""}`}
                      residentName={m.residentName}
                      isControlledDrug={m.isControlledDrug}
                      isPrn
                      reasonCodes={reasonCodes}
                      staffOptions={staffOptions}
                      currentStaffId={staffMember.id}
                      prnSafetyWarning={warning}
                      triggerLabel="Give PRN"
                    />
                  </div>

                  {m.dosesToday.length > 0 ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Today</p>
                      {m.dosesToday.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <StatusBadge tone={DOSE_STATUS_META[d.outcome].tone}>
                              {DOSE_STATUS_META[d.outcome].label}
                            </StatusBadge>{" "}
                            <span className="text-muted-foreground">
                              {timeFmt.format(d.administeredAt)} · {d.staffName}
                            </span>
                            {d.prnReasonNow ? (
                              <p className="text-xs text-muted-foreground">{d.prnReasonNow}</p>
                            ) : null}
                            {d.prnEffectNote ? (
                              <p className="text-xs">Effect: {d.prnEffectNote}</p>
                            ) : null}
                          </div>
                          {d.outcome === "given" && !d.prnEffectNote ? (
                            <PrnEffectNoteDialog
                              administrationId={d.id}
                              medicationLabel={m.medicationName}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6">
        <Link href="/medication" className="text-sm text-primary underline">
          Back to medication
        </Link>
      </p>
    </>
  );
}
