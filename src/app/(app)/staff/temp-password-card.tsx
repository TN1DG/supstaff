"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function TempPasswordCard({
  name,
  password,
  backHref,
}: {
  name: string;
  password: string;
  backHref: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Temporary password for {name}</AlertTitle>
        <AlertDescription>
          Share this with them securely. They&rsquo;ll be asked to set their own
          password when they first sign in. You won&rsquo;t be able to see it
          again.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
        <code className="flex-1 font-mono text-lg tracking-wide">
          {password}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <Button asChild>
        <Link href={backHref}>Done</Link>
      </Button>
    </div>
  );
}
