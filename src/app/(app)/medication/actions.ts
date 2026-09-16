"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  medicationAdministrations,
  medicationReasonCodes,
  medicationSchedules,
  medications,
  residents,
  staff,
} from "@/db/schema";
import { assertRole, assertStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { pinCheck } from "@/lib/pin";
import { bySite } from "@/lib/db-scope";
import { fieldErrors } from "@/lib/forms";
import {
  MEDICATION_ROUNDS,
  checkPrnSafety,
  dayCode,
  isMedicationRound,
  isoDate,
} from "@/lib/medication";

/* -------------------------------------------------------------------- */
/* Medication records (resident-scoped, manual MAR transcription)        */
/* -------------------------------------------------------------------- */

const medicationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  form: z.string().trim().max(100).optional().or(z.literal("")),
  strength: z.string().trim().max(100).optional().or(z.literal("")),
  route: z.string().trim().max(100).optional().or(z.literal("")),
  directions: z.string().trim().max(2000).optional().or(z.literal("")),
  prescriber: z.string().trim().max(200).optional().or(z.literal("")),
  startDate: z.string().date().optional().or(z.literal("")),
  endDate: z.string().date().optional().or(z.literal("")),
  isControlledDrug: z.boolean(),
  isPrn: z.boolean(),
  prnMaxDosePerDay: z.number().int().positive().optional(),
  prnMinIntervalMinutes: z.number().int().positive().optional(),
  prnReason: z.string().trim().max(500).optional().or(z.literal("")),
});

export type MedicationFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseMedicationForm(formData: FormData) {
  const prnMaxRaw = formData.get("prnMaxDosePerDay");
  const prnIntervalRaw = formData.get("prnMinIntervalMinutes");
  return medicationSchema.safeParse({
    name: formData.get("name"),
    form: formData.get("form") ?? "",
    strength: formData.get("strength") ?? "",
    route: formData.get("route") ?? "",
    directions: formData.get("directions") ?? "",
    prescriber: formData.get("prescriber") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    isControlledDrug: formData.get("isControlledDrug") === "on",
    isPrn: formData.get("isPrn") === "on",
    prnMaxDosePerDay:
      prnMaxRaw && String(prnMaxRaw).trim() ? Number(prnMaxRaw) : undefined,
    prnMinIntervalMinutes:
      prnIntervalRaw && String(prnIntervalRaw).trim() ? Number(prnIntervalRaw) : undefined,
    prnReason: formData.get("prnReason") ?? "",
  });
}

function normaliseMedication(data: z.infer<typeof medicationSchema>) {
  return {
    name: data.name,
    form: data.form || null,
    strength: data.strength || null,
    route: data.route || null,
    directions: data.directions || null,
    prescriber: data.prescriber || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    isControlledDrug: data.isControlledDrug,
    isPrn: data.isPrn,
    prnMaxDosePerDay: data.isPrn ? (data.prnMaxDosePerDay ?? null) : null,
    prnMinIntervalMinutes: data.isPrn ? (data.prnMinIntervalMinutes ?? null) : null,
    prnReason: data.isPrn ? data.prnReason || null : null,
  };
}

function roundsFromForm(formData: FormData): string[] {
  return MEDICATION_ROUNDS.filter((r) => formData.get(`round_${r.round}`) === "on").map(
    (r) => r.round,
  );
}

export async function createMedication(
  residentId: string,
  _prev: MedicationFormState,
  formData: FormData,
): Promise<MedicationFormState> {
  const staffMember = await assertRole("support_officer");
  const parsed = parseMedicationForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const rounds = roundsFromForm(formData);

  const db = getDb();
  const resident = await db.query.residents.findFirst({
    where: bySite(residents, residentId, staffMember.siteId),
    columns: { id: true },
  });
  if (!resident) return { error: "Resident not found." };

  const values = normaliseMedication(parsed.data);
  const ctx = await requestContext();
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(medications)
        .values({ siteId: staffMember.siteId, residentId, ...values })
        .returning({ id: medications.id });

      if (!values.isPrn && rounds.length > 0) {
        await tx
          .insert(medicationSchedules)
          .values(rounds.map((roundSlot) => ({ medicationId: row.id, roundSlot })));
      }

      await writeAudit(
        tx,
        {
          ...auditActor(staffMember),
          action: "medication.create",
          entityType: "medication",
          entityId: row.id,
          after: { ...values, rounds },
        },
        ctx,
      );
    });
  } catch {
    return { error: "Could not save the medication. Please try again." };
  }

  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/medication");
  redirect(`/residents/${residentId}`);
}

export async function updateMedication(
  id: string,
  _prev: MedicationFormState,
  formData: FormData,
): Promise<MedicationFormState> {
  const staffMember = await assertRole("support_officer");
  const parsed = parseMedicationForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const rounds = roundsFromForm(formData);

  const db = getDb();
  const existing = await db.query.medications.findFirst({
    where: bySite(medications, id, staffMember.siteId),
  });
  if (!existing) return { error: "Medication not found." };

  const values = normaliseMedication(parsed.data);
  const ctx = await requestContext();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(medications)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(medications.id, id));

      // Schedules aren't historical — replace the whole set.
      await tx.delete(medicationSchedules).where(eq(medicationSchedules.medicationId, id));
      if (!values.isPrn && rounds.length > 0) {
        await tx
          .insert(medicationSchedules)
          .values(rounds.map((roundSlot) => ({ medicationId: id, roundSlot })));
      }

      await writeAudit(
        tx,
        {
          ...auditActor(staffMember),
          action: "medication.update",
          entityType: "medication",
          entityId: id,
          before: existing,
          after: { ...values, rounds },
        },
        ctx,
      );
    });
  } catch {
    return { error: "Could not save your changes. Please try again." };
  }

  revalidatePath(`/residents/${existing.residentId}`);
  revalidatePath("/medication");
  redirect(`/residents/${existing.residentId}`);
}

export async function archiveMedication(id: string) {
  const staffMember = await assertRole("manager");
  const db = getDb();
  const existing = await db.query.medications.findFirst({
    where: bySite(medications, id, staffMember.siteId),
  });
  if (!existing) return;

  const ctx = await requestContext();
  await db.transaction(async (tx) => {
    await tx
      .update(medications)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(medications.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "medication.archive",
        entityType: "medication",
        entityId: id,
        before: existing,
      },
      ctx,
    );
  });

  revalidatePath(`/residents/${existing.residentId}`);
  revalidatePath("/medication");
}

export async function restoreMedication(id: string) {
  const staffMember = await assertRole("manager");
  const db = getDb();
  const existing = await db.query.medications.findFirst({
    where: bySite(medications, id, staffMember.siteId),
  });
  if (!existing) return;

  const ctx = await requestContext();
  await db.transaction(async (tx) => {
    await tx
      .update(medications)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(medications.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "medication.restore",
        entityType: "medication",
        entityId: id,
      },
      ctx,
    );
  });

  revalidatePath(`/residents/${existing.residentId}`);
  revalidatePath("/medication");
}

/* -------------------------------------------------------------------- */
/* Recording a dose — the legally-attributable, PIN-signed act itself    */
/* -------------------------------------------------------------------- */

const outcomeValues = ["given", "refused", "omitted", "not_available", "self_admin"] as const;

export type RecordDoseState = { ok?: boolean; error?: string };

export async function recordAdministration(
  medicationId: string,
  residentId: string,
  scheduledRound: string | null,
  _prev: RecordDoseState,
  formData: FormData,
): Promise<RecordDoseState> {
  const staffMember = await assertStaff();

  const parsedOutcome = z.enum(outcomeValues).safeParse(String(formData.get("outcome") ?? ""));
  if (!parsedOutcome.success) return { error: "Choose an outcome." };
  const outcome = parsedOutcome.data;

  const reasonCodeId = String(formData.get("reasonCodeId") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const prnReasonNow =
    String(formData.get("prnReasonNow") ?? "").trim().slice(0, 1000) || null;
  const pin = String(formData.get("pin") ?? "");
  const witnessStaffId = String(formData.get("witnessStaffId") ?? "") || null;
  const witnessPin = String(formData.get("witnessPin") ?? "");

  if (scheduledRound !== null && !isMedicationRound(scheduledRound)) {
    return { error: "Invalid round." };
  }

  const db = getDb();
  const medication = await db.query.medications.findFirst({
    where: bySite(medications, medicationId, staffMember.siteId),
  });
  if (!medication || !medication.active) return { error: "Medication not found." };
  if (medication.residentId !== residentId) {
    return { error: "Medication does not match resident." };
  }

  const now = new Date();
  const today = isoDate(now);

  // --- All business validation happens before any PIN check ---
  if (medication.isPrn) {
    if (scheduledRound !== null) {
      return { error: "PRN medications aren't tied to a round." };
    }
    if (outcome === "given" && !prnReasonNow) {
      return { error: "Say why this PRN dose is being given now." };
    }
  } else {
    if (scheduledRound === null) return { error: "Choose a round." };
    const schedule = await db.query.medicationSchedules.findFirst({
      where: and(
        eq(medicationSchedules.medicationId, medicationId),
        eq(medicationSchedules.roundSlot, scheduledRound),
      ),
    });
    if (!schedule || !schedule.daysOfWeek.includes(dayCode(now))) {
      return { error: "Not scheduled for this round today." };
    }
    const existingDose = await db.query.medicationAdministrations.findFirst({
      where: and(
        eq(medicationAdministrations.medicationId, medicationId),
        eq(medicationAdministrations.scheduledDate, today),
        eq(medicationAdministrations.scheduledRound, scheduledRound),
      ),
      columns: { id: true },
    });
    if (existingDose) {
      return { error: "Already recorded for this round — refresh to see it." };
    }
  }

  let reasonCode: { id: string } | undefined;
  if (outcome !== "given") {
    if (!reasonCodeId) return { error: "Choose a reason." };
    reasonCode = await db.query.medicationReasonCodes.findFirst({
      where: and(
        eq(medicationReasonCodes.id, reasonCodeId),
        eq(medicationReasonCodes.siteId, staffMember.siteId),
        eq(medicationReasonCodes.active, true),
      ),
      columns: { id: true },
    });
    if (!reasonCode) return { error: "That reason isn't available." };
  }

  const needsWitness = medication.isControlledDrug && outcome === "given";
  if (needsWitness) {
    if (!witnessStaffId) return { error: "Choose a witness for this controlled drug." };
    if (witnessStaffId === staffMember.id) {
      return { error: "The witness must be someone else." };
    }
    const witness = await db.query.staff.findFirst({
      where: and(
        eq(staff.id, witnessStaffId),
        eq(staff.siteId, staffMember.siteId),
        eq(staff.active, true),
      ),
      columns: { id: true },
    });
    if (!witness) return { error: "Witness not found." };
    if (!witnessPin) return { error: "Enter the witness's PIN." };
  }

  let prnSafetyWarningAcknowledged = false;
  if (medication.isPrn && outcome === "given") {
    const givenToday = await db.query.medicationAdministrations.findMany({
      where: and(
        eq(medicationAdministrations.medicationId, medicationId),
        eq(medicationAdministrations.scheduledDate, today),
        eq(medicationAdministrations.outcome, "given"),
      ),
      columns: { administeredAt: true },
    });
    prnSafetyWarningAcknowledged = checkPrnSafety(medication, givenToday, now).warning !== null;
  }

  // --- PIN checks, last — a bad PIN must never mask a validation error ---
  const pinError = await pinCheck(staffMember.id, pin);
  if (pinError) return { error: pinError };

  if (needsWitness) {
    const witnessPinError = await pinCheck(witnessStaffId!, witnessPin);
    if (witnessPinError) return { error: `Witness PIN: ${witnessPinError}` };
  }

  const ctx = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(medicationAdministrations)
        .values({
          siteId: staffMember.siteId,
          medicationId,
          residentId,
          scheduledDate: today,
          scheduledRound,
          administeredAt: now,
          staffId: staffMember.id,
          outcome,
          reasonCodeId: reasonCode?.id ?? null,
          witnessStaffId: needsWitness ? witnessStaffId : null,
          notes,
          prnReasonNow: medication.isPrn ? prnReasonNow : null,
          prnSafetyWarningAcknowledged,
        })
        .returning({ id: medicationAdministrations.id });

      await writeAudit(
        tx,
        {
          ...auditActor(staffMember),
          action: "medication.administer",
          entityType: "medication_administration",
          entityId: row.id,
          after: {
            medicationId,
            residentId,
            scheduledRound,
            outcome,
            reasonCodeId: reasonCode?.id ?? null,
            witnessStaffId: needsWitness ? witnessStaffId : null,
            prnReasonNow,
            prnSafetyWarningAcknowledged,
          },
        },
        ctx,
      );
    });
  } catch (err) {
    if (scheduledRound !== null) {
      const raced = await db.query.medicationAdministrations.findFirst({
        where: and(
          eq(medicationAdministrations.medicationId, medicationId),
          eq(medicationAdministrations.scheduledDate, today),
          eq(medicationAdministrations.scheduledRound, scheduledRound),
        ),
        columns: { id: true },
      });
      if (raced) return { error: "Someone already recorded this dose — refresh to see it." };
    }
    throw err;
  }

  revalidatePath("/medication");
  revalidatePath(scheduledRound ? `/medication/${scheduledRound}` : "/medication/prn-doses");
  revalidatePath(`/residents/${residentId}`);
  return { ok: true };
}

export type PrnEffectNoteState = { ok?: boolean; error?: string };

/** Follow-up clinical annotation — not a new signing event, so no PIN. */
export async function editPrnEffectNote(
  administrationId: string,
  _prev: PrnEffectNoteState,
  formData: FormData,
): Promise<PrnEffectNoteState> {
  const staffMember = await assertStaff();
  const note = String(formData.get("prnEffectNote") ?? "").trim().slice(0, 2000);
  if (!note) return { error: "Write the effect note first." };

  const db = getDb();
  const admin = await db.query.medicationAdministrations.findFirst({
    where: bySite(medicationAdministrations, administrationId, staffMember.siteId),
    with: { medication: { columns: { isPrn: true } } },
  });
  if (!admin) return { error: "Dose record not found." };
  if (admin.outcome !== "given") return { error: "Only a given dose can have an effect note." };
  if (!admin.medication.isPrn) return { error: "This isn't a PRN medication." };

  const ctx = await requestContext();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(medicationAdministrations)
      .set({
        prnEffectNote: note,
        prnEffectNoteAt: now,
        prnEffectNoteByStaffId: staffMember.id,
        updatedAt: now,
      })
      .where(eq(medicationAdministrations.id, administrationId));

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "medication.prn_effect_note",
        entityType: "medication_administration",
        entityId: administrationId,
        before: { prnEffectNote: admin.prnEffectNote },
        after: { prnEffectNote: note },
      },
      ctx,
    );
  });

  revalidatePath("/medication/prn-doses");
  return { ok: true };
}

/* -------------------------------------------------------------------- */
/* Reason codes (manager)                                                */
/* -------------------------------------------------------------------- */

const reasonCodeSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(120),
});

export type ReasonCodeFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export async function createReasonCode(
  _prev: ReasonCodeFormState,
  formData: FormData,
): Promise<ReasonCodeFormState> {
  const staffMember = await assertRole("manager");
  const parsed = reasonCodeSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();

  await db.transaction(async (tx) => {
    const existing = await tx.query.medicationReasonCodes.findMany({
      where: eq(medicationReasonCodes.siteId, staffMember.siteId),
      columns: { sortOrder: true },
    });
    const nextOrder =
      existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 0;

    const [row] = await tx
      .insert(medicationReasonCodes)
      .values({ siteId: staffMember.siteId, label: parsed.data.label, sortOrder: nextOrder })
      .returning({ id: medicationReasonCodes.id });

    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "medication_reason_code.create",
        entityType: "medication_reason_code",
        entityId: row.id,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/medication/reason-codes");
  return { ok: true };
}

export async function updateReasonCode(
  id: string,
  _prev: ReasonCodeFormState,
  formData: FormData,
): Promise<ReasonCodeFormState> {
  const staffMember = await assertRole("manager");
  const parsed = reasonCodeSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const db = getDb();
  const ctx = await requestContext();
  const existing = await db.query.medicationReasonCodes.findFirst({
    where: bySite(medicationReasonCodes, id, staffMember.siteId),
  });
  if (!existing) return { error: "Reason code not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(medicationReasonCodes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(medicationReasonCodes.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: "medication_reason_code.update",
        entityType: "medication_reason_code",
        entityId: id,
        before: existing,
        after: parsed.data,
      },
      ctx,
    );
  });

  revalidatePath("/medication/reason-codes");
  return { ok: true };
}

export async function setReasonCodeActive(id: string, active: boolean) {
  const staffMember = await assertRole("manager");
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.medicationReasonCodes.findFirst({
    where: bySite(medicationReasonCodes, id, staffMember.siteId),
  });
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx
      .update(medicationReasonCodes)
      .set({ active, updatedAt: new Date() })
      .where(eq(medicationReasonCodes.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staffMember),
        action: active
          ? "medication_reason_code.restore"
          : "medication_reason_code.archive",
        entityType: "medication_reason_code",
        entityId: id,
      },
      ctx,
    );
  });

  revalidatePath("/medication/reason-codes");
}

/** Swap sort order with the item immediately before/after it (site-scoped, active list). */
export async function moveReasonCode(id: string, direction: "up" | "down") {
  const staffMember = await assertRole("manager");
  const db = getDb();

  const items = await db.query.medicationReasonCodes.findMany({
    where: and(
      eq(medicationReasonCodes.siteId, staffMember.siteId),
      eq(medicationReasonCodes.active, true),
    ),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
    columns: { id: true, sortOrder: true },
  });

  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  const a = items[idx];
  const b = items[swapIdx];

  await db.transaction(async (tx) => {
    await tx
      .update(medicationReasonCodes)
      .set({ sortOrder: b.sortOrder, updatedAt: new Date() })
      .where(eq(medicationReasonCodes.id, a.id));
    await tx
      .update(medicationReasonCodes)
      .set({ sortOrder: a.sortOrder, updatedAt: new Date() })
      .where(eq(medicationReasonCodes.id, b.id));
  });

  revalidatePath("/medication/reason-codes");
}
