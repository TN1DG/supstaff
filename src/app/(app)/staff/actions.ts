"use server";

import { revalidatePath } from "next/cache";
import { and, eq, not } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { assertRole } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { bySite } from "@/lib/db-scope";
import { fieldErrors } from "@/lib/forms";
import { generateTempPassword, hashSecret } from "@/lib/password";

const baseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["bank_staff", "support_officer", "manager"]),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  engagedUntil: z.string().date().optional().or(z.literal("")),
  isAdmin: z.union([z.literal("on"), z.null(), z.literal("")]).optional(),
});

export type StaffFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  tempPassword?: string;
  createdName?: string;
};

function parse(formData: FormData) {
  return baseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "support_officer",
    phone: formData.get("phone") ?? "",
    engagedUntil: formData.get("engagedUntil") ?? "",
    isAdmin: formData.get("isAdmin"),
  });
}

export async function createStaff(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await assertRole("manager");
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const data = parsed.data;
  const db = getDb();
  const ctx = await requestContext();

  const clash = await db.query.staff.findFirst({
    where: eq(staff.email, data.email),
    columns: { id: true },
  });
  if (clash) {
    return { fieldErrors: { email: "That email already has an account" } };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashSecret(tempPassword);

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(staff)
        .values({
          siteId: actor.siteId,
          name: data.name,
          email: data.email,
          role: data.role,
          phone: data.phone || null,
          engagedUntil: data.role === "bank_staff" ? data.engagedUntil || null : null,
          isAdmin: data.isAdmin === "on",
          passwordHash,
          mustChangePassword: true,
        })
        .returning({ id: staff.id });
      await writeAudit(
        tx,
        {
          ...auditActor(actor),
          action: "staff.create",
          entityType: "staff",
          entityId: row.id,
          after: { name: data.name, email: data.email, role: data.role },
        },
        ctx,
      );
    });
  } catch {
    return { error: "Could not create the account. Please try again." };
  }

  revalidatePath("/staff");
  return { tempPassword, createdName: data.name };
}

const updateSchema = baseSchema.extend({
  active: z.union([z.literal("on"), z.null(), z.literal("")]).optional(),
});

export async function updateStaff(
  id: string,
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await assertRole("manager");
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "support_officer",
    phone: formData.get("phone") ?? "",
    engagedUntil: formData.get("engagedUntil") ?? "",
    isAdmin: formData.get("isAdmin"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const data = parsed.data;
  const db = getDb();
  const ctx = await requestContext();

  const existing = await db.query.staff.findFirst({
    where: bySite(staff, id, actor.siteId),
  });
  if (!existing) return { error: "Staff member not found." };

  // Don't let the last active manager lock the team out.
  if (
    (data.role !== "manager" || data.active !== "on") &&
    existing.role === "manager"
  ) {
    const otherManagers = await db.$count(
      staff,
      and(
        eq(staff.siteId, actor.siteId),
        eq(staff.role, "manager"),
        eq(staff.active, true),
        not(eq(staff.id, id)),
      ),
    );
    if (otherManagers === 0) {
      return { error: "This is the only active manager — assign another first." };
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(staff)
        .set({
          name: data.name,
          email: data.email,
          role: data.role,
          phone: data.phone || null,
          engagedUntil:
            data.role === "bank_staff" ? data.engagedUntil || null : null,
          isAdmin: data.isAdmin === "on",
          active: data.active === "on",
          updatedAt: new Date(),
        })
        .where(eq(staff.id, id));
      await writeAudit(
        tx,
        {
          ...auditActor(actor),
          action: "staff.update",
          entityType: "staff",
          entityId: id,
          before: {
            role: existing.role,
            active: existing.active,
            isAdmin: existing.isAdmin,
          },
          after: {
            role: data.role,
            active: data.active === "on",
            isAdmin: data.isAdmin === "on",
          },
        },
        ctx,
      );
    });
  } catch {
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return {};
}

export async function resetStaffPassword(id: string): Promise<{
  tempPassword?: string;
  error?: string;
}> {
  const actor = await assertRole("manager");
  const db = getDb();
  const ctx = await requestContext();

  const person = await db.query.staff.findFirst({
    where: bySite(staff, id, actor.siteId),
    columns: { id: true, name: true },
  });
  if (!person) return { error: "Staff member not found." };

  const tempPassword = generateTempPassword();
  const passwordHash = await hashSecret(tempPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(staff.id, id));
    await writeAudit(
      tx,
      {
        ...auditActor(actor),
        action: "staff.reset_password",
        entityType: "staff",
        entityId: id,
      },
      ctx,
    );
  });

  revalidatePath(`/staff/${id}`);
  return { tempPassword };
}
