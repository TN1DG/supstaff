"use client";

import { useState, useTransition } from "react";
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
import { startOrOpenHandover } from "./actions";

export function StartHandoverForm({
  today,
  night,
  defaultShift,
}: {
  today: string;
  /** The evening the current/last night shift started — night handovers use this date. */
  night: string;
  defaultShift: "early" | "late" | "night";
}) {
  const [pending, start] = useTransition();
  const [shift, setShift] = useState(defaultShift);

  return (
    <form
      action={(fd) => start(() => startOrOpenHandover(fd))}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="handoverDate">Date</Label>
        <Input
          key={shift}
          id="handoverDate"
          name="handoverDate"
          type="date"
          defaultValue={shift === "night" ? night : today}
          className="w-auto"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="shift">Shift</Label>
        <Select
          name="shift"
          value={shift}
          onValueChange={(v) => setShift(v as typeof shift)}
        >
          <SelectTrigger id="shift" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="early">Early</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="night">Night</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open handover"}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        One handover per shift — everyone on shift writes into the same one.
        A night handover is dated the evening the shift started.
      </p>
    </form>
  );
}
