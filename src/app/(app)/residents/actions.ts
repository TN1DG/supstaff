"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { residents } from "@/db/schema";
import { assertRole } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { bySite } from "@/lib/db-scope";
import { fieldErrors } from "@/lib/forms";

const residentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(120),
  lastName: z.string().trim().min(1, "Last name is required").max(120),
  preferredName: z.string().trim().max(120).optional().or(z.literal("")),
  room: z.string().trim().max(40).optional().or(z.literal("")),
  dateOfBirth: z.string().date().optional().or(z.literal("")),
  admissionDate: z.string().date().optional().or(z.literal("")),
  keyWorkerId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["active", "on_leave", "discharged"]),
  riskFlags: z.string().max(500).optional().or(z.literal("")),
  supportNotes: z.string().max(5000).optional().or(z.literal("")),
});

export type ResidentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseForm(formData: FormData) {
  return residentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    preferredName: formData.get("preferredName") ?? "",
    room: formData.get("room") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    admissionDate: formData.get("admissionDate") ?? "",
    keyWorkerId: formData.get("keyWorkerId") ?? "",
    status: formData.get("status") ?? "active",
    riskFlags: formData.get("riskFlags") ?? "",
    supportNotes: formData.get("supportNotes") ?? "",
  });
}

function normalise(data: z.infer<typeof residentSchema>) {
  const flags = (data.riskFlags ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    preferredName: data.preferredName || null,
    room: data.room || null,
    dateOfBirth: data.dateOfBirth || null,
    admissionDate: data.admissionDate || null,
    keyWorkerId: data.keyWorkerId || null,
    status: data.status,
    riskFlags: flags,
    supportNotes: data.supportNotes || null,
  };
}

export async function createResident(
  _prev: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const staff = await assertRole("support_officer");
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const values = normalise(parsed.data);
  const db = getDb();
  const ctx = await requestContext();
  let newId: string;

  try {
    newId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(residents)
        .values({ siteId: staff.siteId, ...values })
        .returning({ id: residents.id });
      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: "resident.create",
          entityType: "resident",
          entityId: row.id,
          after: values,
        },
        ctx,
      );
      return row.id;
    });
  } catch {
    return { error: "Could not save the resident. Please try again." };
  }

  revalidatePath("/residents");
  redirect(`/residents/${newId}`);
}

export async function updateResident(
  id: string,
  _prev: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const staff = await assertRole("support_officer");
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  const values = normalise(parsed.data);
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.residents.findFirst({
    where: bySite(residents, id, staff.siteId),
  });
  if (!existing) return { error: "Resident not found." };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(residents)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(residents.id, id));
      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: "resident.update",
          entityType: "resident",
          entityId: id,
          before: existing,
          after: values,
        },
        ctx,
      );
    });
  } catch {
    return { error: "Could not save your changes. Please try again." };
  }

  revalidatePath("/residents");
  revalidatePath(`/residents/${id}`);
  redirect(`/residents/${id}`);
}

export async function archiveResident(id: string) {
  const staff = await assertRole("manager");
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.residents.findFirst({
    where: bySite(residents, id, staff.siteId),
  });
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx
      .update(residents)
      .set({ status: "discharged", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(residents.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(staff),
        action: "resident.archive",
        entityType: "resident",
        entityId: id,
        before: existing,
      },
      ctx,
    );
  });

  revalidatePath("/residents");
  revalidatePath(`/residents/${id}`);
}
