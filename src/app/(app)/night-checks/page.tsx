import type { Metadata } from "next";
import { requireStaff } from "@/lib/rbac";
import { PageHeader, ComingSoon } from "@/components/page-header";

export const metadata: Metadata = { title: "Night checks" };

export default async function NightChecksPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="Night checks"
        description="Check in every two hours from 11pm to 7am. Each round builds a timestamped checklist for the manager."
      />
      <ComingSoon feature="Night building checks" />
    </>
  );
}
