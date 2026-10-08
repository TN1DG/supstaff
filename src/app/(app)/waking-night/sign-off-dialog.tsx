"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PinField } from "@/components/pin-field";
import { FormError } from "@/components/form-error";
import { signOffShift, type SignOffState } from "./actions";

export function SignOffDialog({ shiftId, disabled }: { shiftId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SignOffState, FormData>(
    signOffShift.bind(null, shiftId),
    {},
  );

  useEffect(() => {
    if (state.ok) toast.success("Shift signed off");
  }, [state]);

  return (
    <Dialog open={open && !state.ok} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Sign off shift</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Sign off the waking night</DialogTitle>
            <DialogDescription>
              This closes tonight&rsquo;s shift and locks the checklist. Enter
              your signing PIN to confirm it&rsquo;s you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <PinField autoFocus />
            <FormError message={state.error} />
            {state.blockers?.length ? (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {state.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing off…" : "Confirm & sign off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
