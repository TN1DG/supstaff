import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { getSiteConfig } from "@/lib/site-settings";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Service settings" };

export default async function ServiceSettingsPage() {
  const staffMember = await requireRole("manager");
  const config = await getSiteConfig(staffMember.siteId);

  return (
    <>
      <PageHeader
        title="Service settings"
        description="How the waking-night shift works at this service."
      />
      <Card>
        <CardContent className="py-6">
          <ServiceSettingsForm values={config} />
        </CardContent>
      </Card>
    </>
  );
}
