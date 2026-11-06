import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { loadOutboxHealth, OUTBOX_MAX_ATTEMPTS } from "@/lib/outbox";
import { getSiteConfig } from "@/lib/site-settings";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceSettingsForm } from "./settings-form";
import { RetryOutboxButton } from "./retry-outbox-button";

export const metadata: Metadata = { title: "Service settings" };

const TARGET_LABEL = { salesforce: "Salesforce", sawit: "Saw-it", email: "Email" } as const;

export default async function ServiceSettingsPage() {
  const staffMember = await requireRole("manager");
  const [config, queue] = await Promise.all([
    getSiteConfig(staffMember.siteId),
    loadOutboxHealth(staffMember.siteId),
  ]);
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: config.timezone,
  });

  return (
    <>
      <PageHeader
        title="Service settings"
        description="How the waking-night shift works at this service."
      />
      <div className="space-y-6">
        <Card>
          <CardContent className="py-6">
            <ServiceSettingsForm values={config} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Handovers, building reports and team emails queued for Salesforce, Saw-it and
              email. Each is retried daily; after {OUTBOX_MAX_ATTEMPTS} tries it stops and
              shows here as failed.
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">{queue.pending} waiting</StatusBadge>
              <StatusBadge tone="success">{queue.sent} sent</StatusBadge>
              <StatusBadge tone={queue.failed > 0 ? "danger" : "neutral"}>
                {queue.failed} failed
              </StatusBadge>
            </div>
            {queue.recentFailures.length > 0 ? (
              <>
                <ul className="divide-y rounded-lg border">
                  {queue.recentFailures.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                      <span className="font-medium">{TARGET_LABEL[f.target]}</span>
                      <span className="text-muted-foreground">
                        {f.entityType.replaceAll("_", " ")} · queued {dateFmt.format(f.createdAt)}
                      </span>
                      <span className="text-muted-foreground">{f.lastError ?? "No reason recorded"}</span>
                    </li>
                  ))}
                </ul>
                <RetryOutboxButton />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
