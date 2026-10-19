"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormError } from "@/components/form-error";
import { recordEscalationAction } from "./actions";
import { Choice, WhenField } from "./when-field";

export type DialogStep = {
  id: string;
  label: string;
  instruction: string;
  /** "from 04:40" — when the step comes due. */
  timing: string;
  reached: boolean;
  done: boolean;
};

/**
 * Record what you did for an overdue resident. `basis` is the last
 * seen/contacted check this page knew about; the server refuses the action
 * if someone has logged them since (they've been found).
 */
export function EscalationActionDialog({
  residentId,
  residentName,
  steps,
  basis,
  rulesBasis,
}: {
  residentId: string;
  residentName: string;
  steps: DialogStep[];
  basis: string;
  /** The rules version whose steps this dialog lists. */
  rulesBasis: string;
}) {
  const router = useRouter();
  const firstOpen = steps.find((s) => s.reached && !s.done) ?? steps.find((s) => !s.done);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<string>(firstOpen?.id ?? "other");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setStep(firstOpen?.id ?? "other");
    setError(null);
    setConflict(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Record what you did</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {conflict ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>They&rsquo;ve been found</DialogTitle>
              <DialogDescription>{residentName}</DialogDescription>
            </DialogHeader>
            <Alert variant="info">
              <RefreshCw />
              <AlertTitle>Someone logged them while you had this open</AlertTitle>
              <AlertDescription>{conflict}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                  router.refresh();
                }}
              >
                Refresh the board
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            action={(fd) =>
              start(async () => {
                const res = await recordEscalationAction(residentId, {}, fd);
                if (res.ok) {
                  setOpen(false);
                  reset();
                  toast.success(res.message ?? "Recorded");
                  router.refresh();
                } else if (res.conflict) {
                  setConflict(res.conflict);
                } else {
                  setError(res.error ?? "Something went wrong.");
                }
              })
            }
          >
            <input type="hidden" name="basis" value={basis} />
            <input type="hidden" name="rulesBasis" value={rulesBasis} />
            <DialogHeader>
              <DialogTitle>Record an escalation step</DialogTitle>
              <DialogDescription>{residentName}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">What you did</legend>
                <div className="space-y-2">
                  {steps.map((s) => (
                    <Choice
                      key={s.id}
                      name="step"
                      value={s.id}
                      checked={step === s.id}
                      onChange={() => setStep(s.id)}
                      className="block py-2"
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.done ? "done · " : ""}
                          {s.timing}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {s.instruction}
                      </span>
                    </Choice>
                  ))}
                  <Choice
                    name="step"
                    value="other"
                    checked={step === "other"}
                    onChange={() => setStep("other")}
                    className="block py-2"
                  >
                    <span className="font-medium">Something else</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Anything not on the list — say what in the note.
                    </span>
                  </Choice>
                </div>
              </fieldset>

              <WhenField />

              <div className="space-y-1.5">
                <Label htmlFor="action-note" className="flex items-center gap-1.5">
                  Note
                  {step !== "other" ? (
                    <span className="text-xs font-normal text-muted-foreground">optional</span>
                  ) : null}
                </Label>
                <Textarea
                  id="action-note"
                  name="note"
                  rows={3}
                  maxLength={1000}
                  required={step === "other"}
                  placeholder="Who you spoke to and what was agreed, e.g. Spoke to Jo (on-call), keep trying every 30 mins"
                />
              </div>

              <FormError message={error} />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Record"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
