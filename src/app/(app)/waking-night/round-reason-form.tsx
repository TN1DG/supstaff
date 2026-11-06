"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/form-error";
import { setRoundReason, type RoundReasonState } from "../night-checks/actions";

/** Inline "why was this round late/missed?" — required before sign-off. */
export function RoundReasonForm({
  roundId,
  verdict,
}: {
  roundId: string;
  verdict: "late" | "missed";
}) {
  const [state, action, pending] = useActionState<RoundReasonState, FormData>(
    setRoundReason.bind(null, roundId),
    {},
  );
  return (
    <form action={action} className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          name="reason"
          aria-label={`Why was this round ${verdict}?`}
          placeholder={`Why was this round ${verdict}?`}
          maxLength={500}
          required
          className="max-w-md"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-9">
          {pending ? "Saving…" : "Save reason"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
