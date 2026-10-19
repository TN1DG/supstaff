"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { WelfareMethodValue } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import { METHOD_LABEL, WELFARE_METHODS } from "@/lib/welfare";
import type { WelfarePlanState } from "./actions";

type Action = (prev: WelfarePlanState, formData: FormData) => Promise<WelfarePlanState>;

export function WelfarePlanForm({
  action,
  residentId,
  tiers,
  plan,
}: {
  action: Action;
  residentId: string;
  tiers: { key: string; name: string; summary: string }[];
  plan: {
    tierKey: string;
    contactMethods: WelfareMethodValue[];
    howToCheck: string | null;
    residentInvolved: boolean;
    reviewedAt: string | null;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<WelfarePlanState, FormData>(action, {});
  const [tierKey, setTierKey] = useState(plan?.tierKey ?? "");
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} className={undefined} />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Risk tier</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {tiers.map((t) => (
            <label
              key={t.key}
              className="cursor-pointer rounded-lg border p-3 text-sm transition-colors has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="tierKey"
                value={t.key}
                checked={tierKey === t.key}
                onChange={() => setTierKey(t.key)}
                className="sr-only"
              />
              <span className="block font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.summary}</span>
            </label>
          ))}
        </div>
        {plan && !tiers.some((t) => t.key === plan.tierKey) ? (
          <p className="text-xs text-warning-foreground">
            Their current tier isn&rsquo;t in the rules any more — choose another.
          </p>
        ) : null}
        {err("tierKey") ? <p className="text-xs text-destructive">{err("tierKey")}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Ways to check on them</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {WELFARE_METHODS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox
                name="contactMethods"
                value={m}
                defaultChecked={plan?.contactMethods.includes(m) ?? m === "in_person"}
              />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
        {err("contactMethods") ? (
          <p className="text-xs text-destructive">{err("contactMethods")}</p>
        ) : null}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="howToCheck" className="flex items-center gap-1.5">
          How to check on them
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <Textarea
          id="howToCheck"
          name="howToCheck"
          rows={4}
          maxLength={1000}
          defaultValue={plan?.howToCheck ?? ""}
          placeholder="e.g. Prefers a text after 10pm rather than a knock. Usually at the gym Tuesday evenings."
        />
        {err("howToCheck") ? <p className="text-xs text-destructive">{err("howToCheck")}</p> : null}
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <label className="flex items-start gap-3">
          <Checkbox name="residentInvolved" defaultChecked={plan?.residentInvolved ?? false} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Agreed with the resident</span>
            <span className="block text-muted-foreground">
              They helped decide how and how often they&rsquo;re checked on.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <Checkbox name="reviewed" defaultChecked={!plan} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">Reviewed today</span>
            <span className="block text-muted-foreground">
              {plan?.reviewedAt
                ? `Last reviewed ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(plan.reviewedAt))}.`
                : "Not reviewed yet."}{" "}
              Tick when you&rsquo;ve gone through the plan with them.
            </span>
          </span>
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : plan ? "Save plan" : "Create plan"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={`/residents/${residentId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
