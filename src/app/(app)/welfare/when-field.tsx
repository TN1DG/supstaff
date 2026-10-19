"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORG_GUARDRAILS, formatMinutes } from "@/lib/welfare-policy";

/**
 * "Just now" or "Earlier, at HH:MM". The server reads the typed time as the
 * most recent time the clock showed it, so 23:50 typed at 00:10 means last
 * night — see `mostRecentWallTime`.
 */
export function WhenField({ label = "When" }: { label?: string }) {
  const [when, setWhen] = useState<"now" | "earlier">("now");
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Choice name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")}>
          Just now
        </Choice>
        <Choice
          name="when"
          value="earlier"
          checked={when === "earlier"}
          onChange={() => setWhen("earlier")}
        >
          Earlier
        </Choice>
        {when === "earlier" ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="when-time" className="sr-only">
              Time it happened
            </Label>
            <Input id="when-time" name="time" type="time" required className="w-28" />
          </div>
        ) : null}
      </div>
      {when === "earlier" ? (
        <p className="text-xs text-muted-foreground">
          Up to {formatMinutes(ORG_GUARDRAILS.lateLogWindowMinutes)} ago. Both
          the time it happened and the time you logged it are kept.
        </p>
      ) : null}
    </fieldset>
  );
}

/** A pill-shaped radio. Native input, so it works with plain form posts. */
export function Choice({
  name,
  value,
  checked,
  onChange,
  children,
  className = "",
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:checked]:text-foreground has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 ${className}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {children}
    </label>
  );
}
