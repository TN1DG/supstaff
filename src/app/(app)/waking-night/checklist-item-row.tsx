"use client";

import { useActionState, useState } from "react";
import { Bot, User } from "lucide-react";
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
import { FormError } from "@/components/form-error";
import { StatusBadge } from "@/components/status-badge";
import type { ChecklistResultStatusValue } from "@/db/schema";
import type { Evidence } from "@/lib/waking-night/checklist";
import { resolveChecklistItem, type ResolveItemState } from "./actions";

export type ChecklistRowItem = {
  key: string;
  label: string;
  kind: "auto" | "manual";
  allowNa: boolean;
  source: string | null;
  status: ChecklistResultStatusValue | null;
  resolvedBy: "auto" | "manual" | null;
  reason: string | null;
  evidence: Evidence[];
  issues: string[];
  resolvedByName: string | null;
  resolvedAtLabel: string | null;
};

const STATUS_META = {
  done: { tone: "success", label: "Done" },
  not_done: { tone: "warning", label: "Not done" },
  na: { tone: "neutral", label: "N/A" },
} as const;

export function ChecklistItemRow({
  shiftId,
  item,
  readOnly,
}: {
  shiftId: string;
  item: ChecklistRowItem;
  readOnly: boolean;
}) {
  const meta = item.status ? STATUS_META[item.status] : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.label}</p>
          {meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : null}
        </div>
        {item.kind === "auto" ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="size-3.5" aria-hidden />
            {item.resolvedBy === "auto" ? "Completed automatically" : "Auto"} · {item.source}
          </p>
        ) : null}
        {item.evidence.length > 0 ? (
          <ul className="text-sm">
            {item.evidence.map((e) => (
              <li key={`${e.label}${e.href ?? ""}`}>
                {e.href ? (
                  <a href={e.href} className="text-primary underline">
                    {e.label}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{e.label}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {item.resolvedBy === "auto" && item.evidence.length === 0 && item.reason ? (
          // Signed-off shift: the evidence recorded at sign-off.
          <p className="text-sm text-muted-foreground">{item.reason}</p>
        ) : null}
        {item.issues.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-warning">
            {item.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        ) : null}
        {item.resolvedBy === "manual" ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3.5" aria-hidden />
            {item.resolvedByName ?? "Staff"}
            {item.resolvedAtLabel ? ` · ${item.resolvedAtLabel}` : ""}
            {item.reason ? ` — ${item.reason}` : ""}
          </p>
        ) : null}
      </div>
      {!readOnly && item.resolvedBy !== "auto" ? (
        <ResolveDialog shiftId={shiftId} item={item} />
      ) : null}
    </div>
  );
}

function ResolveDialog({ shiftId, item }: { shiftId: string; item: ChecklistRowItem }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ChecklistResultStatusValue>(item.status ?? "done");
  const [state, action, pending] = useActionState<ResolveItemState, FormData>(
    async (prev, fd) => {
      const res = await resolveChecklistItem(shiftId, item.key, prev, fd);
      if (res.ok) setOpen(false);
      return res;
    },
    {},
  );

  const reasonRequired = status === "not_done" || (status === "done" && item.kind === "auto");
  const options: ChecklistResultStatusValue[] = item.allowNa
    ? ["done", "not_done", "na"]
    : ["done", "not_done"];
  const trigger = item.status ? "Change" : item.kind === "auto" ? "Complete manually" : "Resolve";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={item.status ? "ghost" : "outline"}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>{item.label}</DialogTitle>
            <DialogDescription>
              {item.kind === "auto"
                ? "This normally ticks itself from other records. If that record is missing, complete it here and say why."
                : "Mark it done, or not done with a reason."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Outcome</legend>
              {options.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="size-4 accent-primary"
                  />
                  {STATUS_META[s].label}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${item.key}`}>
                {reasonRequired ? "Reason" : "Note (optional)"}
              </Label>
              <Textarea
                id={`reason-${item.key}`}
                name="reason"
                rows={2}
                maxLength={500}
                required={reasonRequired}
                defaultValue={item.reason ?? ""}
              />
            </div>
            <FormError message={state.error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
