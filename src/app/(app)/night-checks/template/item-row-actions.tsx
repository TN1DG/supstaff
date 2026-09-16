"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { moveTemplateItem, setTemplateItemActive } from "../actions";

export function ItemRowActions({
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
        onClick={() => start(() => setTemplateItemActive(id, true))}
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
        onClick={() => start(() => moveTemplateItem(id, "up"))}
        aria-label="Move up"
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || isLast}
        onClick={() => start(() => moveTemplateItem(id, "down"))}
        aria-label="Move down"
      >
        ↓
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(() => setTemplateItemActive(id, false))}
      >
        {pending ? "Archiving…" : "Archive"}
      </Button>
    </div>
  );
}
