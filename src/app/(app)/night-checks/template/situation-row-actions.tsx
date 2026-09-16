"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { moveSituationType, setSituationTypeActive } from "../actions";

export function SituationRowActions({
  id,
  active,
  isFirst,
  isLast,
}: {
  id: string;
  active: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [pending, start] = useTransition();

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => setSituationTypeActive(id, true))}
      >
        {pending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || isFirst}
        onClick={() => start(() => moveSituationType(id, "up"))}
        aria-label="Move up"
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || isLast}
        onClick={() => start(() => moveSituationType(id, "down"))}
        aria-label="Move down"
      >
        ↓
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => setSituationTypeActive(id, false))}
      >
        {pending ? "Archiving…" : "Archive"}
      </Button>
    </div>
  );
}
