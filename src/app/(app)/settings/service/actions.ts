"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { siteSettings } from "@/db/schema";
import { assertRole } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { fieldErrors } from "@/lib/forms";
import { getSiteConfig } from "@/lib/site-settings";
import { isMedicationRound } from "@/lib/medication";
import { isValidSlotTime, sortNightSlots } from "@/lib/waking-night/rounds";

const roundTimesSchema = z
  .string()
  .transform((s) => s.split(/[\s,]+/).filter(Boolean))
  .pipe(
    z
      .array(z.string().refine(isValidSlotTime, "Use 24-hour times like 23:00"))
      .min(1, "Add at least one round time")
      .max(12, "At most 12 rounds a night"),
  )
  .transform(sortNightSlots);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/** Digits, spaces, + ( ) - only — it becomes a tel: link. */
const phone = optionalText(30).refine(
  (v) => v === null || /^\+?[\d\s()-]{3,}$/.test(v),
  "Use digits, spaces and + only",
);

const settingsSchema = z.object({
  roundTimes: roundTimesSchema,
  roundToleranceMinutes: z.coerce
    .number()
    .int("Whole minutes only")
    .min(5, "At least 5 minutes")
    .max(120, "At most 120 minutes"),
  eveningMedRounds: z
    .array(z.string().refine(isMedicationRound, "Unknown round"))
    .min(1, "Pick at least one round"),
  teamEmail: optionalText(200).pipe(z.email("Enter a valid email address").nullable()),
  oohRepairsPhone: phone,
  onCallManagerPhone: phone,
  emergencyPhone: phone,
  nhsPhone: phone,
  policeNonEmergencyPhone: phone,
  hasLoneWorkerDevice: z.boolean(),
});

const PHONE_FIELDS = [
  "oohRepairsPhone",
  "onCallManagerPhone",
  "emergencyPhone",
  "nhsPhone",
  "policeNonEmergencyPhone",
] as const;

export type ServiceSettingsState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/**
 * Save the service's waking-night configuration. Schedule changes apply from
 * the next shift started — rounds already created keep their times.
 */
export async function saveServiceSettings(
  _prev: ServiceSettingsState,
  formData: FormData,
): Promise<ServiceSettingsState> {
  const staffMember = await assertRole("manager");
  const parsed = settingsSchema.safeParse({
    roundTimes: formData.get("roundTimes") ?? "",
    roundToleranceMinutes: formData.get("roundToleranceMinutes"),
    eveningMedRounds: formData.getAll("eveningMedRounds"),
    teamEmail: formData.get("teamEmail") ?? "",
    ...Object.fromEntries(PHONE_FIELDS.map((f) => [f, formData.get(f) ?? ""])),
    hasLoneWorkerDevice: formData.get("hasLoneWorkerDevice") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();
  const before = await getSiteConfig(staffMember.siteId);
  const now = new Date();
  const values = { ...parsed.data, updatedAt: now, updatedByStaffId: staffMember.id };

  await db.transaction(async (tx) => {
    await tx
      .insert(siteSettings)
      .values({ siteId: staffMember.siteId, ...values })
      .onConflictDoUpdate({ target: siteSettings.siteId, set: values });
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "site_settings.update",
        entityType: "site_settings",
        entityId: staffMember.siteId,
        before: {
          roundTimes: before.roundTimes,
          roundToleranceMinutes: before.roundToleranceMinutes,
          eveningMedRounds: before.eveningMedRounds,
          teamEmail: before.teamEmail,
          ...Object.fromEntries(PHONE_FIELDS.map((f) => [f, before[f]])),
          hasLoneWorkerDevice: before.hasLoneWorkerDevice,
        },
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/settings/service");
  revalidatePath("/waking-night");
  revalidatePath("/night-checks");
  return { ok: true };
}
