import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { medicationReasonCodes, residents } from "@/db/schema";
import { currentHandoverSlot } from "@/lib/handover-defaults";
import { appendHandoverNote } from "@/lib/handover-sync";
import { roundLabel } from "@/lib/medication";
import { enqueueOutbox } from "@/lib/outbox";
import { getSiteConfig } from "@/lib/site-settings";

/** Outcomes that are a medication issue: they go on the handover and to the team. */
export const MEDICATION_ISSUE_OUTCOMES = {
  refused: "Refused",
  omitted: "Omitted",
  not_available: "Not available",
} as const;

export function isMedicationIssue(outcome: string): outcome is keyof typeof MEDICATION_ISSUE_OUTCOMES {
  return outcome in MEDICATION_ISSUE_OUTCOMES;
}

/**
 * A refused/omitted/unavailable dose: write it onto the current shift's
 * handover (resident's card, or an addendum once submitted) and queue an
 * email to the team. Runs inside the dose's own transaction, so neither
 * exists without the other.
 */
export async function reportMedicationIssue(
  tx: DbOrTx,
  params: {
    siteId: string;
    administrationId: string;
    residentId: string;
    medicationName: string;
    strength: string | null;
    scheduledRound: string | null;
    outcome: keyof typeof MEDICATION_ISSUE_OUTCOMES;
    reasonCodeId: string | null;
    notes: string | null;
    staff: { id: string; name: string };
    ctx: { ip?: string | null; userAgent?: string | null };
    now: Date;
  },
) {
  const config = await getSiteConfig(params.siteId, tx);
  const [resident, reason] = await Promise.all([
    tx.query.residents.findFirst({
      where: eq(residents.id, params.residentId),
      columns: { firstName: true, lastName: true, preferredName: true, room: true },
    }),
    params.reasonCodeId
      ? tx.query.medicationReasonCodes.findFirst({
          where: eq(medicationReasonCodes.id, params.reasonCodeId),
          columns: { label: true },
        })
      : null,
  ]);
  const residentName = resident
    ? `${resident.preferredName ?? resident.firstName} ${resident.lastName}`
    : "Resident";
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(params.now);
  const what = `${MEDICATION_ISSUE_OUTCOMES[params.outcome]}: ${params.medicationName}${
    params.strength ? ` ${params.strength}` : ""
  } (${params.scheduledRound ? roundLabel(params.scheduledRound) : "PRN"})`;
  const why = [reason?.label, params.notes].filter(Boolean).join(" — ");
  const line = `[Medication · ${time}] ${what}${why ? ` — ${why}` : ""} (${params.staff.name})`;

  const slot = currentHandoverSlot(params.now, config.timezone);
  const { handoverId } = await appendHandoverNote(tx, {
    siteId: params.siteId,
    handoverDate: slot.date,
    shift: slot.shift,
    residentId: params.residentId,
    addendumPrefix: `${residentName}${resident?.room ? ` (Room ${resident.room})` : ""}`,
    line,
    incidentFlag: false,
    staff: params.staff,
    ctx: params.ctx,
    auditAfter: { administrationId: params.administrationId, outcome: params.outcome },
  });

  await enqueueOutbox(tx, {
    siteId: params.siteId,
    target: "email",
    entityType: "medication_administration",
    entityId: params.administrationId,
    payload: {
      kind: "medication_issue",
      to: config.teamEmail,
      subject: `Medication issue — ${residentName}: ${what}`,
      body: `${line}\n\nOn the ${slot.shift} handover for ${slot.date}.`,
      handoverId,
    },
  });
}
