"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { retryFailedOutbox, type RetryOutboxState } from "./actions";

export function RetryOutboxButton() {
  const [state, action, pending] = useActionState<RetryOutboxState, FormData>(
    retryFailedOutbox,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Retrying…" : "Retry failed deliveries"}
      </Button>
      {state.ok ? (
        <span className="text-sm text-muted-foreground">
          {state.requeued
            ? `${state.requeued} put back in the queue.`
            : "Nothing to retry."}
        </span>
      ) : null}
      <FormError message={state.error} />
    </form>
  );
}
