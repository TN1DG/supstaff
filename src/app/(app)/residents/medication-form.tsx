"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MEDICATION_ROUNDS } from "@/lib/medication";
import type { Medication, MedicationSchedule } from "@/db/schema";
import type { MedicationFormState } from "@/app/(app)/medication/actions";

type Action = (
  prev: MedicationFormState,
  formData: FormData,
) => Promise<MedicationFormState>;

export function MedicationForm({
  action,
  residentId,
  medication,
  schedules,
}: {
  action: Action;
  residentId: string;
  medication?: Medication;
  schedules?: MedicationSchedule[];
}) {
  const [state, formAction, pending] = useActionState<MedicationFormState, FormData>(
    action,
    {},
  );
  const err = (f: string) => state.fieldErrors?.[f];
  const [isPrn, setIsPrn] = useState(medication?.isPrn ?? false);
  const scheduledRounds = new Set(schedules?.map((s) => s.roundSlot) ?? []);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err("name")}>
          <Input name="name" defaultValue={medication?.name} required />
        </Field>
        <Field label="Strength" error={err("strength")} optional>
          <Input name="strength" defaultValue={medication?.strength ?? ""} placeholder="e.g. 500mg" />
        </Field>
        <Field label="Form" error={err("form")} optional>
          <Input name="form" defaultValue={medication?.form ?? ""} placeholder="e.g. Tablet" />
        </Field>
        <Field label="Route" error={err("route")} optional>
          <Input name="route" defaultValue={medication?.route ?? ""} placeholder="e.g. Oral" />
        </Field>
        <Field label="Prescriber" error={err("prescriber")} optional>
          <Input name="prescriber" defaultValue={medication?.prescriber ?? ""} />
        </Field>
        <Field label="Start date" error={err("startDate")} optional>
          <Input type="date" name="startDate" defaultValue={medication?.startDate ?? ""} />
        </Field>
        <Field label="End date" error={err("endDate")} optional>
          <Input type="date" name="endDate" defaultValue={medication?.endDate ?? ""} />
        </Field>
      </div>

      <Field label="Directions" error={err("directions")} optional>
        <Textarea name="directions" rows={2} defaultValue={medication?.directions ?? ""} />
      </Field>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isControlledDrug" defaultChecked={medication?.isControlledDrug} />
          Controlled drug — needs a witness signature
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            name="isPrn"
            checked={isPrn}
            onCheckedChange={(v) => setIsPrn(v === true)}
          />
          PRN — as needed (not on a fixed round)
        </label>
      </div>

      {isPrn ? (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <Field label="Max doses per day" error={err("prnMaxDosePerDay")} optional>
            <Input
              type="number"
              min={1}
              name="prnMaxDosePerDay"
              defaultValue={medication?.prnMaxDosePerDay ?? ""}
            />
          </Field>
          <Field label="Minimum interval (minutes)" error={err("prnMinIntervalMinutes")} optional>
            <Input
              type="number"
              min={1}
              name="prnMinIntervalMinutes"
              defaultValue={medication?.prnMinIntervalMinutes ?? ""}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Standing reason" error={err("prnReason")} optional hint="e.g. Pain relief">
              <Input name="prnReason" defaultValue={medication?.prnReason ?? ""} />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Rounds due</Label>
          <div className="flex flex-wrap gap-4">
            {MEDICATION_ROUNDS.map((r) => (
              <label key={r.round} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name={`round_${r.round}`}
                  defaultChecked={scheduledRounds.has(r.round)}
                />
                {r.label} ({r.time})
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Applies every day for now.</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : medication ? "Save changes" : "Add medication"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={`/residents/${residentId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {optional ? (
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
