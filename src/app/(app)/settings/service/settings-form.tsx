"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { MEDICATION_ROUNDS } from "@/lib/medication";
import { saveServiceSettings, type ServiceSettingsState } from "./actions";

export type ServiceSettingsValues = {
  roundTimes: string[];
  roundToleranceMinutes: number;
  eveningMedRounds: string[];
  teamEmail: string | null;
  oohRepairsPhone: string | null;
  onCallManagerPhone: string | null;
  emergencyPhone: string | null;
  nhsPhone: string | null;
  policeNonEmergencyPhone: string | null;
  hasLoneWorkerDevice: boolean;
};

const PHONES = [
  { name: "oohRepairsPhone", label: "Out-of-hours repairs" },
  { name: "onCallManagerPhone", label: "On-call manager" },
  { name: "emergencyPhone", label: "Emergency services", placeholder: "999" },
  { name: "nhsPhone", label: "NHS non-emergency", placeholder: "111" },
  { name: "policeNonEmergencyPhone", label: "Police non-emergency", placeholder: "101" },
] as const;

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function ServiceSettingsForm({ values }: { values: ServiceSettingsValues }) {
  const [state, action, pending] = useActionState<ServiceSettingsState, FormData>(
    saveServiceSettings,
    {},
  );
  const fe = state.fieldErrors;

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="font-medium">Welfare rounds</h2>
          <p className="text-sm text-muted-foreground">
            Created when a waking-night shift starts. Changes apply from the
            next shift — rounds already scheduled keep their times.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="roundTimes">Round times</Label>
            <Input
              id="roundTimes"
              name="roundTimes"
              defaultValue={values.roundTimes.join(", ")}
              placeholder="23:00, 01:00, 03:00, 05:00, 07:00"
              required
            />
            <p className="text-xs text-muted-foreground">
              24-hour times, separated by commas. Times before noon belong to
              the following morning.
            </p>
            <FieldError message={fe?.roundTimes} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="roundToleranceMinutes">On-time window (± minutes)</Label>
            <Input
              id="roundToleranceMinutes"
              name="roundToleranceMinutes"
              type="number"
              min={5}
              max={120}
              defaultValue={values.roundToleranceMinutes}
              required
            />
            <p className="text-xs text-muted-foreground">
              A round finished outside this window is late and needs a reason.
            </p>
            <FieldError message={fe?.roundToleranceMinutes} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-medium">End-of-shift checklist</h2>
          <p className="text-sm text-muted-foreground">
            What the auto-completed checklist items check against.
          </p>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Evening medication rounds night staff supervise</legend>
          <div className="flex flex-wrap gap-4">
            {MEDICATION_ROUNDS.map((r) => (
              <label key={r.round} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="eveningMedRounds"
                  value={r.round}
                  defaultChecked={values.eveningMedRounds.includes(r.round)}
                  className="size-4 accent-primary"
                />
                {r.label} ({r.time})
              </label>
            ))}
          </div>
          <FieldError message={fe?.eveningMedRounds} />
        </fieldset>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="teamEmail">Team email</Label>
          <Input
            id="teamEmail"
            name="teamEmail"
            type="email"
            defaultValue={values.teamEmail ?? ""}
            placeholder="team@example.org"
          />
          <p className="text-xs text-muted-foreground">
            Where incident and medication-issue emails go. They&rsquo;re queued
            now and sent once email delivery is switched on.
          </p>
          <FieldError message={fe?.teamEmail} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-medium">Quick reference</h2>
          <p className="text-sm text-muted-foreground">
            The numbers night staff can tap to call from the waking-night page.
            Leave any you don&rsquo;t use blank.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PHONES.map((p) => (
            <div key={p.name} className="space-y-1.5">
              <Label htmlFor={p.name}>{p.label}</Label>
              <Input
                id={p.name}
                name={p.name}
                type="tel"
                defaultValue={values[p.name] ?? ""}
                placeholder={"placeholder" in p ? p.placeholder : undefined}
                maxLength={30}
              />
              <FieldError message={fe?.[p.name]} />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="hasLoneWorkerDevice"
            defaultChecked={values.hasLoneWorkerDevice}
            className="size-4 accent-primary"
          />
          This service has a lone worker device — remind night staff to carry it all shift
        </label>
      </section>

      <FormError message={state.error} className={undefined} />
      {state.ok ? <p className="text-sm text-success">Settings saved.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
