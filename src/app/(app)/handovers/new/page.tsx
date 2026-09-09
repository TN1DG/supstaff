import type { Metadata } from "next";
import { requireStaff } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StartHandoverForm } from "../start-form";

export const metadata: Metadata = { title: "Start a handover" };

export default async function NewHandoverPage() {
  await requireStaff();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Start a handover"
        description="Pick the shift you're handing over. Every resident in the house will be listed for you."
      />
      <Card>
        <CardContent className="pt-6">
          <StartHandoverForm today={today} />
        </CardContent>
      </Card>
    </div>
  );
}
