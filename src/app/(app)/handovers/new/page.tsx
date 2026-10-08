import type { Metadata } from "next";
import { requireCareStaff } from "@/lib/rbac";
import { handoverStartDefaults } from "@/lib/handover-defaults";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StartHandoverForm } from "../start-form";

export const metadata: Metadata = { title: "Start a handover" };

export default async function NewHandoverPage() {
  const staff = await requireCareStaff();
  const defaults = await handoverStartDefaults(staff.siteId);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Start a handover"
        description="Pick the shift you're handing over. Every resident in the house will be listed for you."
      />
      <Card>
        <CardContent className="pt-6">
          <StartHandoverForm
            today={defaults.today}
            night={defaults.night}
            defaultShift={defaults.shift}
          />
        </CardContent>
      </Card>
    </div>
  );
}
