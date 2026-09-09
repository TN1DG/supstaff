import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { PageHeader, ComingSoon } from "@/components/page-header";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  await requireRole("manager");
  return (
    <>
      <PageHeader
        title="Insights"
        description="Cross-module reporting for CQC evidence and team oversight."
      />
      <ComingSoon feature="Manager insights" />
    </>
  );
}
