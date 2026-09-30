"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { MaintenancePriorityValue, MaintenanceStatusValue } from "@/db/schema";
import { FormError } from "@/components/form-error";
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
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_META,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_META,
} from "@/lib/maintenance";
import type { TriageFormState } from "../actions";

type Action = (prev: TriageFormState, formData: FormData) => Promise<TriageFormState>;

type State = TriageFormState & { attempt: number };

export function TriageForm({
  action,
  report,
}: {
  action: Action;
  report: {
    status: MaintenanceStatusValue;
    priority: MaintenancePriorityValue;
    assignedTo: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.ok) toast.success("Report updated");
      return { ...result, attempt: prev.attempt + 1 };
    },
    { attempt: 0 },
  );
  const err = (f: string) => state.fieldErrors?.[f];

  // Re-key on every save so the fields pick up the freshly revalidated report.
  return (
    <form
      key={`${state.attempt}-${report.status}-${report.priority}`}
      action={formAction}
      className="space-y-4"
    >
      <FormError message={state.error} className={undefined} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select name="status" defaultValue={report.status}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MAINTENANCE_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select name="priority" defaultValue={report.priority}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {MAINTENANCE_PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assignedTo" className="flex items-center gap-1.5">
          With
          <span className="text-xs font-normal text-muted-foreground">
            contractor or person
          </span>
        </Label>
        <Input
          id="assignedTo"
          name="assignedTo"
          defaultValue={report.assignedTo ?? ""}
          placeholder="e.g. Acme Plumbing, job #4471"
        />
        {err("assignedTo") ? (
          <p className="text-xs text-destructive">{err("assignedTo")}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note" className="flex items-center gap-1.5">
          Note
          <span className="text-xs font-normal text-muted-foreground">
            added to the timeline
          </span>
        </Label>
        <Textarea id="note" name="note" rows={3} placeholder="What happened, what's next?" />
        {err("note") ? <p className="text-xs text-destructive">{err("note")}</p> : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save update"}
      </Button>
    </form>
  );
}
