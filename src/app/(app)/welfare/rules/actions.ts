"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { welfarePolicyVersions } from "@/db/schema";
import { assertCareStaff } from "@/lib/rbac";
import { auditActor, requestContext, writeAudit } from "@/lib/audit";
import { pinCheck } from "@/lib/pin";
import {
  canEditWelfareRules,
  loadWelfareFacts,
  residentsOnTier,
  siteTimeZone,
} from "@/lib/welfare-queries";
import { needsActionOverWindow, type WelfareCounts } from "@/lib/welfare-snapshot";
import {
  parsePolicyConfig,
  validatePolicy,
  type PolicyIssue,
  type WelfarePolicyConfig,
} from "@/lib/welfare-policy";
import { addDays, zonedDate } from "@/lib/zoned-time";

export type PublishRulesState = {
  error?: string;
  /** Guardrail breaches — publishing is blocked until they're fixed. */
  issues?: PolicyIssue[];
  /** Someone else published while this editor was open. */
  conflict?: string;
};

function readConfig(raw: FormDataEntryValue | string | null): WelfarePolicyConfig | null {
  try {
    return parsePolicyConfig(JSON.parse(String(raw ?? "")));
  } catch {
    return null;
  }
}

const metaSchema = z.object({
  changeNote: z.string().trim().min(3, "Say what changed and why").max(500),
  reviewDueOn: z.string().date("Choose a review date"),
  basisVersion: z.coerce.number().int().min(0),
});

/**
 * Publish a new version of the service's welfare rules. Inside the
 * organisation guardrails it goes live at once — no approval queue — and
 * never changes an escalation already running (those are pinned).
 */
export async function publishWelfareRules(
  _prev: PublishRulesState,
  formData: FormData,
): Promise<PublishRulesState> {
  const staff = await assertCareStaff();
  if (!(await canEditWelfareRules(staff))) {
    return { error: "Only the manager or their welfare rules deputy can publish rules." };
  }

  const config = readConfig(formData.get("config"));
  if (!config) return { error: "The rules couldn't be read. Reload the page and try again." };
  const meta = metaSchema.safeParse({
    changeNote: formData.get("changeNote") ?? "",
    reviewDueOn: formData.get("reviewDueOn") ?? "",
    basisVersion: formData.get("basisVersion") ?? "0",
  });
  if (!meta.success) return { error: meta.error.issues[0]?.message ?? "Check your entries." };

  const timeZone = await siteTimeZone(staff.siteId);
  const today = zonedDate(new Date(), timeZone);
  if (meta.data.reviewDueOn <= today || meta.data.reviewDueOn > addDays(today, 2 * 366)) {
    return { error: "Set a review date in the next two years." };
  }

  const issues = validatePolicy(config, await residentsOnTier(staff.siteId));
  if (issues.length > 0) return { issues };

  const pinError = await pinCheck(staff.id, String(formData.get("pin") ?? ""));
  if (pinError) return { error: pinError };

  const ctx = await requestContext();
  let result: PublishRulesState & { version?: number };
  try {
    result = await getDb().transaction(async (tx) => {
      // Lock the latest version row so two publishes can't both build on it.
      const [latest] = await tx
        .select({ version: welfarePolicyVersions.version, publishedAt: welfarePolicyVersions.publishedAt })
        .from(welfarePolicyVersions)
        .where(eq(welfarePolicyVersions.siteId, staff.siteId))
        .orderBy(desc(welfarePolicyVersions.version))
        .limit(1)
        .for("update");
      const currentVersion = latest?.version ?? 0;
      if (currentVersion !== meta.data.basisVersion) {
        return {
          conflict: `Version ${currentVersion} was published while you were editing. Nothing was published — reload to start from the latest rules.`,
        };
      }

      // Re-check in-use tiers inside the transaction.
      const inUse = validatePolicy(config, await residentsOnTier(staff.siteId, tx));
      if (inUse.length > 0) return { issues: inUse };

      const version = currentVersion + 1;
      const [row] = await tx
        .insert(welfarePolicyVersions)
        .values({
          siteId: staff.siteId,
          version,
          config,
          changeNote: meta.data.changeNote,
          reviewDueOn: meta.data.reviewDueOn,
          publishedByStaffId: staff.id,
        })
        .returning({ id: welfarePolicyVersions.id });

      await writeAudit(
        tx,
        {
          ...auditActor(staff),
          action: "welfare_rules.publish",
          entityType: "welfare_policy_version",
          entityId: row.id,
          after: { version, changeNote: meta.data.changeNote, reviewDueOn: meta.data.reviewDueOn, config },
        },
        ctx,
      );
      return { version };
    });
  } catch (err) {
    const code =
      (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") {
      // Lost a race on the (site, version) unique constraint.
      return {
        conflict: "Someone else published at the same moment. Nothing was published — reload and try again.",
      };
    }
    console.error("publishWelfareRules failed", err);
    return { error: "Could not publish the rules. Please try again." };
  }

  if (!result.version) return result;
  revalidatePath("/welfare");
  revalidatePath("/welfare/rules");
  redirect(`/welfare/rules?published=${result.version}`);
}

export type RulesPreview = {
  error?: string;
  current?: { peak: number; peakAt: string | null; now: WelfareCounts } | null;
  draft?: { peak: number; peakAt: string | null; now: WelfareCounts };
};

/**
 * How the draft rules would play out against the last 24 hours of real
 * checks, next to the rules in force — so a manager sees "this would have
 * flagged 9 residents at 03:00" before publishing, not after.
 */
export async function previewWelfareRules(configJson: string): Promise<RulesPreview> {
  const staff = await assertCareStaff();
  if (!(await canEditWelfareRules(staff))) return { error: "Not allowed." };
  const config = readConfig(configJson);
  if (!config) return { error: "The rules couldn't be read." };

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 3_600_000);
  const facts = await loadWelfareFacts(staff.siteId, from);
  const run = (policy?: WelfarePolicyConfig) => {
    const r = needsActionOverWindow(facts, from, now, policy);
    return { peak: r.peak, peakAt: r.peakAt?.toISOString() ?? null, now: r.now };
  };
  return {
    current: facts.versions.length > 0 ? run(undefined) : null,
    draft: run(config),
  };
}
