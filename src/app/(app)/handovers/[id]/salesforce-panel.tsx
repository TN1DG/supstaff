"use client";

import { useState } from "react";
import { Check, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SalesforcePanel({
  handoverId,
  summary,
  synced,
}: {
  handoverId: string;
  summary: string;
  synced: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salesforce</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {synced
            ? "Queued for Salesforce — it will sync automatically once the connection is switched on."
            : "This handover is ready to go into Salesforce."}
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
