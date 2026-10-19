"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WelfareMethodValue, WelfareOutcomeValue } from "@/db/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/form-error";
import {
  DEFAULT_METHOD,
  METHOD_LABEL,
  OUTCOME_HINT,
  OUTCOME_LABEL,
  WELFARE_METHODS,
  WELFARE_OUTCOMES,
} from "@/lib/welfare";
import { logWelfareCheck } from "./actions";
import { Choice, WhenField } from "./when-field";

export function LogCheckDialog({
  residentId,
  residentName,
  defaultOutcome = "seen",
  triggerLabel = "Log check",
  variant = "default",
}: {
  residentId: string;
  residentName: string;
  defaultOutcome?: WelfareOutcomeValue;
  triggerLabel?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<WelfareOutcomeValue>(defaultOutcome);
  const [method, setMethod] = useState<WelfareMethodValue>(DEFAULT_METHOD[defaultOutcome]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setOutcome(defaultOutcome);
    setMethod(DEFAULT_METHOD[defaultOutcome]);
    setError(null);
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
        <Button size="sm" variant={variant}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await logWelfareCheck(residentId, {}, fd);
              if (res.ok) {
                setOpen(false);
                reset();
                toast.success(res.message ?? "Check logged");
                router.refresh();
              } else {
                setError(res.error ?? "Something went wrong.");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Log a welfare check</DialogTitle>
            <DialogDescription>{residentName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">What happened</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {WELFARE_OUTCOMES.map((o) => (
                  <Choice
                    key={o}
                    name="outcome"
                    value={o}
                    checked={outcome === o}
                    onChange={() => {
                      setOutcome(o);
                      setMethod(DEFAULT_METHOD[o]);
                    }}
                    className="py-2.5"
                  >
                    <span className="block font-medium">{OUTCOME_LABEL[o]}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {OUTCOME_HINT[o]}
                    </span>
                  </Choice>
                ))}
              </div>
              {outcome === "no_response" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  A no response doesn&rsquo;t reset their clock. If they&rsquo;re overdue, it
                  starts the escalation steps.
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="method">How</Label>
              <Select
                name="method"
                value={method}
                onValueChange={(v) => setMethod(v as WelfareMethodValue)}
              >
                <SelectTrigger id="method" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WELFARE_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <WhenField />

            <div className="space-y-1.5">
              <Label htmlFor="note" className="flex items-center gap-1.5">
                Note
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </Label>
              <Textarea
                id="note"
                name="note"
                rows={2}
                maxLength={1000}
                placeholder={
                  outcome === "no_response"
                    ? "What you tried, e.g. knocked twice, called mobile — no answer"
                    : "Anything the next shift should know"
                }
              />
            </div>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log check"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
