"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { residentWelfarePlans, welfareMethod } from "@/db/schema";
import { assertRole } from "@/lib/rbac";
import { auditActor, requestContext, writeAudit } from "@/lib/audit";
import { listPolicyVersions } from "@/lib/welfare-queries";
import { lockResident } from "@/lib/welfare-write";

export type WelfarePlanState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const planSchema = z.object({
  tierKey: z.string().min(1, "Choose a risk tier").max(40),
  contactMethods: z
    .array(z.enum(welfareMethod.enumValues))
    .min(1, "Choose at least one way to check on them"),
  howToCheck: z.string().trim().max(1000, "Keep this under 1,000 characters"),
  residentInvolved: z.boolean(),
  reviewed: z.boolean(),
});

/** Create or update a resident's welfare plan (key worker / support officer and up). */
export async function saveWelfarePlan(
  residentId: string,
  _prev: WelfarePlanState,
  formData: FormData,
): Promise<WelfarePlanState> {
  const staff = await assertRole("support_officer");
  const parsed = planSchema.safeParse({
    tierKey: formData.get("tierKey") ?? "",
    contactMethods: formData.getAll("contactMethods").map(String),
    howToCheck: formData.get("howToCheck") ?? "",
    residentInvolved: formData.get("residentInvolved") === "on",
    reviewed: formData.get("reviewed") === "on",
  });
  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0] ?? ""), i.message]),
      ),
    };
  }
  const data = parsed.data;

  const [current] = await listPolicyVersions(staff.siteId);
  if (!current) return { error: "Publish the service's welfare rules before setting up plans." };
  if (!current.config.tiers.some((t) => t.key === data.tierKey)) {
    return { fieldErrors: { tierKey: "That tier isn't in the current rules — reload the page." } };
  }

  const ctx = await requestContext();
  const now = new Date();
  let saved: "ok" | "not_found";
  try {
    saved = await getDb().transaction(async (tx) => {
      const resident = await lockResident(tx, staff.siteId, residentId);
      if (!resident || resident.status === "discharged") return "not_found" as const;

      const existing = await tx.query.residentWelfarePlans.findFirst({
        where: eq(residentWelfarePlans.residentId, residentId),
      });
      const values = {
        tierKey: data.tierKey,
        contactMethods: data.contactMethods,
        howToCheck: data.howToCheck || null,
        residentInvolved: data.residentInvolved,
        reviewedAt: data.reviewed ? now : existing?.reviewedAt ?? null,
        updatedByStaffId: staff.id,
        updatedAt: now,
      };

      if (existing) {
        await tx
          .update(residentWelfarePlans)
          .set(values)
          .where(eq(residentWelfarePlans.id, existing.id));
      } else {
        await tx.insert(residentWelfarePlans).values({
          ...values,
          siteId: staff.siteId,
          residentId,
          startedAt: now,
          createdAt: now,
        });
      }

      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: existing ? "welfare_plan.update" : "welfare_plan.create",
          entityType: "resident_welfare_plan",
          entityId: residentId,
          before: existing
            ? {
                tierKey: existing.tierKey,
                contactMethods: existing.contactMethods,
                howToCheck: existing.howToCheck,
                residentInvolved: existing.residentInvolved,
              }
            : undefined,
          after: {
            tierKey: data.tierKey,
            contactMethods: data.contactMethods,
            howToCheck: data.howToCheck || null,
            residentInvolved: data.residentInvolved,
            reviewed: data.reviewed,
            rulesVersion: current.version,
          },
        },
        ctx,
      );
      return "ok" as const;
    });
  } catch (err) {
    console.error("saveWelfarePlan failed", err);
    return { error: "Could not save the plan. Please try again." };
  }
  if (saved === "not_found") return { error: "Resident not found." };

  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/welfare");
  redirect(`/residents/${residentId}`);
}
