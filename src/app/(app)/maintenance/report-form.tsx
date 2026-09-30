"use client";

import { useActionState } from "react";
import { toast } from "sonner";
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
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_PRIORITY_META,
} from "@/lib/maintenance";
import { FLOORS } from "@/lib/night-checks";
import { createReport, type ReportFormState } from "./actions";

const NO_ROOM = "none";

type State = ReportFormState & { values?: Record<string, string>; attempt: number };

export function ReportForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (prev, fd) => {
      const result = await createReport(prev, fd);
      if (result.ok) {
        toast.success("Report logged — the housing officer has been notified");
        return { attempt: prev.attempt + 1 };
      }
      // React resets the form after every action; hand the entries back so a
      // validation error doesn't wipe what the staff member typed.
      const values = Object.fromEntries(
        [...fd.entries()].map(([k, v]) => [k, String(v)]),
      );
      return { ...result, values, attempt: prev.attempt + 1 };
    },
    { attempt: 0 },
  );
  const v = state.values ?? {};
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form key={state.attempt} action={formAction} className="space-y-4">
      <FormError message={state.error} className={undefined} />

      <div className="space-y-1.5">
        <Label htmlFor="title">What&rsquo;s the problem?</Label>
        <Input
          id="title"
          name="title"
          defaultValue={v.title}
          placeholder="e.g. Kitchen tap dripping constantly"
          required
        />
        {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="location">Where?</Label>
          <Input
            id="location"
            name="location"
            defaultValue={v.location}
            placeholder="e.g. Ground floor kitchen"
            required
          />
          {err("location") ? (
            <p className="text-xs text-destructive">{err("location")}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Resident room
            <span className="text-xs font-normal text-muted-foreground">optional</span>
          </Label>
          <Select name="roomNumber" defaultValue={v.roomNumber || NO_ROOM}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROOM}>Not in a room</SelectItem>
              {FLOORS.flatMap((f) =>
                f.rooms.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    Room {r} (floor {f.floor})
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>
          {err("roomNumber") ? (
            <p className="text-xs text-destructive">{err("roomNumber")}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select name="category" defaultValue={v.category || "other"}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {MAINTENANCE_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>How urgent?</Label>
          <Select name="priority" defaultValue={v.priority || "normal"}>
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
          <p className="text-xs text-muted-foreground">
            Urgent = a risk to someone&rsquo;s safety right now. Call the on-call
            line as well.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="flex items-center gap-1.5">
          Details
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={v.description}
          rows={3}
          placeholder="When did you notice it? Anything you've already done?"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
