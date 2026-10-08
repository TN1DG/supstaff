"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PinField } from "@/components/pin-field";
import { FormError } from "@/components/form-error";
import { completeRound } from "../actions";

export function CompleteRoundDialog({
  roundId,
  floors,
  lateHint,
}: {
  roundId: string;
  floors: number[];
  /** The round is already outside its ±tolerance window, so a reason will be needed. */
  lateHint: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(lateHint);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Complete round</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await completeRound(roundId, fd);
              if (res.error) {
                setError(res.error);
                if (res.reasonRequired) setShowReason(true);
              } else {
                setOpen(false);
                toast.success("Round completed");
                router.refresh();
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Complete this round</DialogTitle>
            <DialogDescription>
              This timestamps the round as done and locks the checklist. A
              welfare round is a floor-level walk — no room entry. Enter your
              signing PIN to confirm it&rsquo;s you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Floors covered</legend>
              <div className="flex flex-wrap gap-4">
                {floors.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="floors"
                      value={f}
                      defaultChecked
                      className="size-4 accent-primary"
                    />
                    Floor {f}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="observations">H&amp;S issues or resident concerns (optional)</Label>
              <Textarea
                id="observations"
                name="observations"
                rows={2}
                maxLength={2000}
                placeholder="Anything you saw on the walk that isn't already in the checklist"
              />
            </div>
            {showReason ? (
              <div className="space-y-1.5">
                <Label htmlFor="reason">Why is this round off schedule?</Label>
                <Textarea id="reason" name="reason" rows={2} maxLength={500} required />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <PinField />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Completing…" : "Confirm & complete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
