"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { classifyFormError } from "@/lib/form-error-tone";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { recordAdministration } from "./actions";

const OUTCOMES = [
  { value: "given", label: "Given" },
  { value: "refused", label: "Refused" },
  { value: "omitted", label: "Omitted" },
  { value: "not_available", label: "Not available" },
  { value: "self_admin", label: "Self-administered" },
] as const;

export function RecordDoseDialog({
  medicationId,
  residentId,
  scheduledRound,
  medicationLabel,
  residentName,
  isControlledDrug,
  isPrn,
  reasonCodes,
  staffOptions,
  currentStaffId,
  prnSafetyWarning,
  triggerLabel = "Record",
}: {
  medicationId: string;
  residentId: string;
  scheduledRound: string | null;
  medicationLabel: string;
  residentName: string;
  isControlledDrug: boolean;
  isPrn: boolean;
  reasonCodes: { id: string; label: string }[];
  staffOptions: { id: string; name: string }[];
  currentStaffId: string;
  prnSafetyWarning?: string | null;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("given");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsReason = outcome !== "given";
  const needsWitness = isControlledDrug && outcome === "given";
  const witnessOptions = staffOptions.filter((s) => s.id !== currentStaffId);

  function reset() {
    setOutcome("given");
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
        <Button size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await recordAdministration(medicationId, residentId, scheduledRound, {}, fd);
              if (res.error) {
                setError(res.error);
              } else {
                setOpen(false);
                reset();
                toast.success("Dose recorded");
                router.refresh();
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>{medicationLabel}</DialogTitle>
            <DialogDescription>{residentName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Select name="outcome" value={outcome} onValueChange={setOutcome}>
                <SelectTrigger id="outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsReason ? (
              <div className="space-y-1.5">
                <Label htmlFor="reasonCodeId">Reason</Label>
                <Select name="reasonCodeId" required>
                  <SelectTrigger id="reasonCodeId">
                    <SelectValue placeholder="Choose a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonCodes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {isPrn && outcome === "given" ? (
              <div className="space-y-1.5">
                <Label htmlFor="prnReasonNow">Why now?</Label>
                <Textarea
                  id="prnReasonNow"
                  name="prnReasonNow"
                  rows={2}
                  required
                  placeholder="e.g. agitated, pacing"
                />
                {prnSafetyWarning ? (
                  <Alert variant="warning">
                    <AlertTriangle />
                    <AlertDescription>{prnSafetyWarning}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>

            {needsWitness ? (
              <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Controlled drug — needs a witness
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="witnessStaffId">Witnessed by</Label>
                  <Select name="witnessStaffId" required>
                    <SelectTrigger id="witnessStaffId">
                      <SelectValue placeholder="Choose a witness" />
                    </SelectTrigger>
                    <SelectContent>
                      {witnessOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="witnessPin">Witness PIN</Label>
                  <Input
                    id="witnessPin"
                    name="witnessPin"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    required
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="pin">Your signing PIN</Label>
              <Input
                id="pin"
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                autoFocus
                required
              />
            </div>

            {error
              ? (() => {
                  const { tone, icon: Icon } = classifyFormError(error);
                  return (
                    <Alert variant={tone === "info" ? "info" : "destructive"}>
                      <Icon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  );
                })()
              : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
