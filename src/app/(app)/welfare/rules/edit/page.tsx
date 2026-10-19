import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCareStaff } from "@/lib/rbac";
import {
  canEditWelfareRules,
  listPolicyVersions,
  residentsOnTier,
  siteTimeZone,
} from "@/lib/welfare-queries";
import { DEFAULT_POLICY } from "@/lib/welfare-policy";
import { addDays, zonedDate } from "@/lib/zoned-time";
import { PageHeader } from "@/components/page-header";
import { RulesEditor } from "./rules-editor";

export const metadata: Metadata = { title: "Edit welfare rules" };

export default async function EditWelfareRulesPage() {
  const staff = await requireCareStaff();
  if (!(await canEditWelfareRules(staff))) redirect("/welfare/rules");

  const [versions, inUse, timeZone] = await Promise.all([
    listPolicyVersions(staff.siteId),
    residentsOnTier(staff.siteId),
    siteTimeZone(staff.siteId),
  ]);
  const current = versions[0] ?? null;
  const today = zonedDate(new Date(), timeZone);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={current ? "Edit welfare rules" : "Set up welfare rules"}
        description={
          current
            ? `Editing from version ${current.version}. Nothing changes for staff until you publish.`
            : "Starting from the organisation default. Nothing is live until you publish."
        }
      />
      <RulesEditor
        initial={current?.config ?? DEFAULT_POLICY}
        basisVersion={current?.version ?? 0}
        residentsOnTier={inUse}
        timeZone={timeZone}
        defaultReviewDue={addDays(today, 365)}
        minReviewDate={addDays(today, 1)}
        maxReviewDate={addDays(today, 2 * 366)}
      />
    </div>
  );
}
