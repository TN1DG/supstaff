"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startShift } from "./actions";

export function StartShiftButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await startShift();
          toast.success("Shift started — tonight’s rounds are scheduled");
        })
      }
    >
      {pending ? "Starting…" : "Start waking night"}
    </Button>
  );
}
