"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { assertStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { hashSecret, isValidPin } from "@/lib/password";
import { firstIssue } from "@/lib/forms";
import {
  verifyCurrentPassword,
  ReauthLockedError,
  retryPhrase,
} from "@/lib/credentials";

export type AccountState = { error?: string; ok?: string };

/** Re-auth with the current password, mapping a lockout to a friendly message. */
async function confirmPassword(
  staffId: string,
  password: string,
): Promise<AccountState | null> {
  try {
    const person = await verifyCurrentPassword(staffId, password);
    return person ? null : { error: "Your current password is not right." };
  } catch (err) {
    if (err instanceof ReauthLockedError) {
      return { error: `Too many attempts — try again ${retryPhrase(err.retryAfterSec)}.` };
    }
    throw err;
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(200),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "The two passwords don't match",
    path: ["confirm"],
  });

export async function changePassword(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const me = await assertStaff();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const blocked = await confirmPassword(me.id, parsed.data.currentPassword);
  if (blocked) return blocked;

  const db = getDb();
  const ctx = await requestContext();
  const passwordHash = await hashSecret(parsed.data.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(staff.id, me.id));
    await writeAudit(
      tx,
      {
        ...auditActor(me),
        action: "staff.change_password",
        entityType: "staff",
        entityId: me.id,
      },
      ctx,
    );
  });

  revalidatePath("/account");
  return { ok: "Password updated." };
}

const pinSchema = z
  .object({
    currentPassword: z.string().min(1, "Confirm with your password"),
    pin: z.string(),
    confirm: z.string(),
  })
  .refine((d) => d.pin === d.confirm, {
    message: "The two PINs don't match",
    path: ["confirm"],
  });

export async function setPin(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const me = await assertStaff();
  const parsed = pinSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    pin: formData.get("pin"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }
  if (!isValidPin(parsed.data.pin)) {
    return { error: "Your PIN must be 4 to 6 digits." };
  }

  const blocked = await confirmPassword(me.id, parsed.data.currentPassword);
  if (blocked) return blocked;

  const db = getDb();
  const ctx = await requestContext();
  const pinHash = await hashSecret(parsed.data.pin);
  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ pinHash, updatedAt: new Date() })
      .where(eq(staff.id, me.id));
    await writeAudit(
      tx,
      {
        ...auditActor(me),
        action: "staff.set_pin",
        entityType: "staff",
        entityId: me.id,
      },
      ctx,
    );
  });

  revalidatePath("/account/pin");
  return { ok: "Signing PIN saved." };
}
