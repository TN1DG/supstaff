"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { signOut } from "@/lib/auth";
import { assertStaff } from "@/lib/rbac";
import { writeAudit, requestContext, auditActor } from "@/lib/audit";
import { hashSecret, verifySecret } from "@/lib/password";
import { firstIssue } from "@/lib/forms";
import {
  verifyCurrentPassword,
  ReauthLockedError,
  retryPhrase,
} from "@/lib/credentials";

export type WelcomeState = { error?: string };

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter the temporary password"),
    newPassword: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "The two passwords don't match",
    path: ["confirm"],
  });

export async function forcePasswordChange(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const me = await assertStaff();
  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  let person;
  try {
    person = await verifyCurrentPassword(me.id, parsed.data.currentPassword);
  } catch (err) {
    if (err instanceof ReauthLockedError) {
      return { error: `Too many attempts — wait ${retryPhrase(err.retryAfterSec)}.` };
    }
    throw err;
  }
  if (!person) return { error: "That temporary password is not right." };

  if (await verifySecret(person.passwordHash, parsed.data.newPassword)) {
    return { error: "Choose a different password from the temporary one." };
  }

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
        action: "staff.first_password_set",
        entityType: "staff",
        entityId: me.id,
      },
      ctx,
    );
  });

  // Sign out so they re-authenticate with a clean token.
  await signOut({ redirectTo: "/login?changed=1" });
  return {};
}
