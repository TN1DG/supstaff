"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { checkInRound } from "./actions";

export function CheckInButton({
  roundTime,
  label = "Check in",
}: {
  roundTime: string;
  label?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(() => checkInRound(fd))}
      className="inline-flex"
    >
      <input type="hidden" name="roundTime" value={roundTime} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Checking in…" : label}
      </Button>
    </form>
  );
}
