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
import type { FollowUpStatusValue } from "@/db/schema";
import { resolveFollowUp, type ResolveFollowUpState } from "./event-actions";

export type FollowUpRowItem = {
  id: string;
  label: string;
  status: FollowUpStatusValue;
  allowNa: boolean;
  choices: string[] | null;
  choice: string | null;
  reason: string | null;
  /** Null with a resolved status: done by the system. */
  resolvedByName: string | null;
  resolvedAtLabel: string | null;
  /** The record that did it, for auto follow-ups. */
  link: { label: string; href: string } | null;
};

const STATUS_META = {
  open: { tone: "warning", label: "To do" },
  done: { tone: "success", label: "Done" },
  not_done: { tone: "warning", label: "Not done" },
  na: { tone: "neutral", label: "N/A" },
} as const;

export function FollowUpRow({ item, readOnly }: { item: FollowUpRowItem; readOnly: boolean }) {
  const meta = STATUS_META[item.status];
  const bySystem = item.status !== "open" && !item.resolvedByName;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{item.label}</span>
          <StatusBadge tone={meta.tone}>
            {meta.label}
            {item.choice ? ` · ${item.choice}` : ""}
          </StatusBadge>
        </div>
        {bySystem ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="size-3.5" aria-hidden />
            Done automatically
            {item.link ? (
              <>
                {" · "}
                <a href={item.link.href} className="text-primary underline">
                  {item.link.label}
                </a>
              </>
            ) : null}
          </p>
        ) : item.status !== "open" ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3.5" aria-hidden />
            {item.resolvedByName}
            {item.resolvedAtLabel ? ` · ${item.resolvedAtLabel}` : ""}
            {item.reason ? ` — ${item.reason}` : ""}
          </p>
        ) : null}
      </div>
      {!readOnly && !bySystem ? <ResolveFollowUpDialog item={item} /> : null}
    </li>
  );
}

function ResolveFollowUpDialog({ item }: { item: FollowUpRowItem }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"done" | "not_done" | "na">(
    item.status === "open" ? "done" : item.status,
  );
  const [state, action, pending] = useActionState<ResolveFollowUpState, FormData>(
    async (prev, fd) => {
      const res = await resolveFollowUp(item.id, prev, fd);
      if (res.ok) setOpen(false);
      return res;
    },
    {},
  );
  const options = item.allowNa
    ? (["done", "not_done", "na"] as const)
    : (["done", "not_done"] as const);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={item.status === "open" ? "outline" : "ghost"}>
          {item.status === "open" ? "Update" : "Change"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action}>
          <DialogHeader>
            <DialogTitle>{item.label}</DialogTitle>
            <DialogDescription>Done, or not done with a reason.</DialogDescription>
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
            {status === "done" && item.choices?.length ? (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Which did you call?</legend>
                <div className="flex gap-4">
                  {item.choices.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="choice"
                        value={c}
                        defaultChecked={item.choice === c}
                        required
                        className="size-4 accent-primary"
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`fu-reason-${item.id}`}>
                {status === "not_done" ? "Reason" : "Note (optional)"}
              </Label>
              <Textarea
                id={`fu-reason-${item.id}`}
                name="reason"
                rows={2}
                maxLength={500}
                required={status === "not_done"}
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
