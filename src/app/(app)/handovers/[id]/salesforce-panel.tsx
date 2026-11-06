"use client";

import { useState } from "react";
import { Check, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OutboxStatusValue } from "@/db/schema";

const STATUS_TEXT: Record<OutboxStatusValue | "none", string> = {
  none: "This handover is ready to go into Salesforce.",
  pending: "Queued for Salesforce — it will sync automatically once the connection is switched on.",
  processing: "Sending to Salesforce…",
  sent: "Sent to Salesforce.",
  failed:
    "Salesforce sync stopped after repeated tries. A manager can retry it from Service settings, or use the PDF or copy below.",
};

export function SalesforcePanel({
  handoverId,
  summary,
  status,
}: {
  handoverId: string;
  summary: string;
  /** The latest Salesforce outbox row's status, or null if none was queued. */
  status: OutboxStatusValue | null;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salesforce</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {STATUS_TEXT[status ?? "none"]}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/handovers/${handoverId}/pdf`} target="_blank" rel="noreferrer">
              <FileDown className="size-4" /> Download PDF
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(summary);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy text for Salesforce"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
