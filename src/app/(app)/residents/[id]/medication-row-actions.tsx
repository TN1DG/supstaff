"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveMedication, restoreMedication } from "@/app/(app)/medication/actions";

export function MedicationRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => restoreMedication(id))}
      >
        {pending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(() => archiveMedication(id))}
    >
      {pending ? "Archiving…" : "Archive"}
    </Button>
  );
}
