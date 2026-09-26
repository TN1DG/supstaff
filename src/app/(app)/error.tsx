"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Route-level error boundary for the authenticated shell. Without this, any
 * throw in a server component takes the whole page down; here the sidebar and
 * header survive and the failure stays contained to the content area.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[supstaff] route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription>
          <p className="font-medium">This page couldn&apos;t be loaded.</p>
          <p className="mt-1">
            Nothing you were working on has been lost. Try again, and if it
            keeps happening let your manager know.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs opacity-70">
              Reference: {error.digest}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>

      <Button onClick={reset} className="mt-4" variant="outline">
        <RotateCw />
        Try again
      </Button>
    </div>
  );
}
