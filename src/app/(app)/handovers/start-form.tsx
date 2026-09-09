"use client";

import { useTransition } from "react";
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

export function StartHandoverForm({ today }: { today: string }) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(() => startOrOpenHandover(fd))}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="handoverDate">Date</Label>
        <Input
          id="handoverDate"
          name="handoverDate"
          type="date"
          defaultValue={today}
          className="w-auto"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="shift">Shift</Label>
        <Select name="shift" defaultValue="late">
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
      </p>
    </form>
  );
}
