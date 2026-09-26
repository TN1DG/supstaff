"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Row controls for the manager-maintained ordered lists (night-check template
 * items, welfare situation types, medication reason codes). The three lists
 * behave identically, so they share this component and pass their own server
 * actions in rather than each keeping a copy.
 */
export function OrderedRowActions({
  id,
  active,
  isFirst,
  isLast,
  onMove,
  onSetActive,
}: {
  id: string;
  active: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMove: (id: string, direction: "up" | "down") => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => onSetActive(id, true))}
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
        onClick={() => start(() => onMove(id, "up"))}
        aria-label="Move up"
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || isLast}
        onClick={() => start(() => onMove(id, "down"))}
        aria-label="Move down"
      >
        ↓
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => onSetActive(id, false))}
      >
        {pending ? "Archiving…" : "Archive"}
      </Button>
    </div>
  );
}
