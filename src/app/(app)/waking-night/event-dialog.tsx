"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import {
  NIGHT_EVENT_META,
  NIGHT_EVENT_TYPES,
  followUpsFor,
  type NightEventSeverity,
  type NightEventType,
} from "@/lib/waking-night/escalation";
import { logEvent, type LogEventState } from "./event-actions";

export type ResidentOption = { id: string; name: string; room: string | null };

const NO_RESIDENT = "none";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

/**
 * Log something that happened tonight. The list of follow-ups it will create
 * is shown live from the same escalation rules the server applies.
 */
export function EventDialog({
  shiftId,
  residents,
  defaultTime,
  roundId,
  triggerLabel = "Log an event",
  quickReference,
}: {
  shiftId: string;
  residents: ResidentOption[];
  /** "HH:MM" in site time, so the default is right whatever the browser's clock zone. */
  defaultTime: string;
  roundId?: string;
  triggerLabel?: string;
  /** The quick-dial panel, shown alongside so the numbers are to hand. */
  quickReference?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NightEventType>("accident_incident");
  const [severity, setSeverity] = useState<NightEventSeverity>("minor_managed");
  const [residentId, setResidentId] = useState(NO_RESIDENT);
  const [state, action, pending] = useActionState<LogEventState, FormData>(
    async (prev, fd) => {
      const res = await logEvent(shiftId, prev, fd);
      if (res.ok) {
        setOpen(false);
        toast.success("Event logged — follow-ups added to the checklist");
      }
      return res;
    },
    {},
  );
  const fe = state.fieldErrors;
  const followUps = followUpsFor({ type, severity });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form action={action}>
          <DialogHeader>
            <DialogTitle>Log an event</DialogTitle>
            <DialogDescription>
              It goes on the night handover, and the follow-ups below are added
              to tonight&rsquo;s checklist.
            </DialogDescription>
          </DialogHeader>
          {roundId ? <input type="hidden" name="roundId" value={roundId} /> : null}

          <div className="grid gap-6 py-3 sm:grid-cols-[1fr_14rem]">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="event-type">What happened</Label>
                <Select name="type" value={type} onValueChange={(v) => setType(v as NightEventType)}>
                  <SelectTrigger id="event-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NIGHT_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {NIGHT_EVENT_META[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{NIGHT_EVENT_META[type].hint}</p>
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">How serious</legend>
                <div className="flex flex-wrap gap-4">
                  {(
                    [
                      ["minor_managed", "Minor — already managed"],
                      ["serious", "Serious"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="severity"
                        value={value}
                        checked={severity === value}
                        onChange={() => setSeverity(value)}
                        className="size-4 accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="event-resident">Customer (optional)</Label>
                  <Select value={residentId} onValueChange={setResidentId}>
                    <SelectTrigger id="event-resident" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_RESIDENT}>No one specific</SelectItem>
                      {residents.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.room ? ` · Room ${r.room}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {residentId !== NO_RESIDENT ? (
                    <input type="hidden" name="residentId" value={residentId} />
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-time">Time</Label>
                  <Input
                    id="event-time"
                    name="occurredTime"
                    type="time"
                    defaultValue={defaultTime}
                    required
                  />
                  <FieldError message={fe?.occurredTime} />
                </div>
              </div>

              {type === "emergency_repair" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="event-location">Where</Label>
                  <Input
                    id="event-location"
                    name="location"
                    placeholder="e.g. Kitchen, Stairwell B, Room 7"
                    maxLength={200}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    An urgent building report is raised for the housing officer.
                  </p>
                  <FieldError message={fe?.location} />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="event-description">Description</Label>
                <Textarea
                  id="event-description"
                  name="description"
                  rows={4}
                  maxLength={4000}
                  required
                />
                <FieldError message={fe?.description} />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="policeAttended" className="size-4 accent-primary" />
                Police attended
              </label>

              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">This will add follow-ups:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {followUps.map((f) => (
                    <li key={f.kind}>
                      {f.label}
                      {f.auto ? (
                        <span className="text-muted-foreground"> — done automatically</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <FormError message={state.error} />
            </div>

            {quickReference ? <div>{quickReference}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Logging…" : "Log event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
