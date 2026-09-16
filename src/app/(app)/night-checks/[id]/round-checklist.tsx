"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveRoundItems, type SaveItemsState } from "../actions";

export type ChecklistItem = {
  templateItemId: string;
  area: string;
  description: string;
  status: "ok" | "attention" | "na" | null;
  note: string | null;
};

const STATUS_OPTIONS = [
  { value: "ok", label: "OK" },
  { value: "attention", label: "Needs attention" },
  { value: "na", label: "N/A" },
] as const;

function ItemRow({ item }: { item: ChecklistItem }) {
  const [status, setStatus] = useState(item.status);

  return (
    <div className="space-y-2 border-b py-4 last:border-b-0">
      <div>
        <p className="font-medium">{item.area}</p>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={`${item.area} status`}
        className="flex flex-wrap gap-2"
      >
        {STATUS_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
              status === opt.value
                ? opt.value === "attention"
                  ? "border-warning bg-warning/15 text-warning"
                  : opt.value === "ok"
                    ? "border-success bg-success/15 text-success"
                    : "border-foreground/30 bg-muted"
                : "border-border hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={`status_${item.templateItemId}`}
              value={opt.value}
              defaultChecked={item.status === opt.value}
              onChange={() => setStatus(opt.value)}
              className="sr-only"
              required
            />
            {opt.label}
          </label>
        ))}
      </div>
      {status === "attention" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">
            What needs attention? <span className="text-warning">(required)</span>
          </Label>
          <Textarea
            name={`note_${item.templateItemId}`}
            rows={2}
            defaultValue={item.note ?? ""}
            required
          />
        </div>
      ) : (
        <Textarea
          name={`note_${item.templateItemId}`}
          rows={1}
          defaultValue={item.note ?? ""}
          placeholder="Optional note"
          className="text-sm"
        />
      )}
    </div>
  );
}

export function RoundChecklist({
  roundId,
  items,
}: {
  roundId: string;
  items: ChecklistItem[];
}) {
  const [state, action, pending] = useActionState<SaveItemsState, FormData>(
    saveRoundItems.bind(null, roundId),
    {},
  );

  return (
    <form action={action}>
      <div>
        {items.map((item) => (
          <ItemRow key={item.templateItemId} item={item} />
        ))}
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No checklist items configured yet — ask a manager to set one up.
        </p>
      ) : null}
      <div className="flex items-center gap-3 pt-4">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save checklist"}
        </Button>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : state.ok ? (
          <p className="text-sm text-primary">Saved</p>
        ) : null}
      </div>
    </form>
  );
}
