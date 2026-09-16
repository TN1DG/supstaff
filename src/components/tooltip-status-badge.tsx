"use client";

import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TONE, type StatusTone } from "@/lib/status-tone";

/**
 * Same look as `StatusBadge`, but shows `tooltip` on hover/focus — for risk
 * flags and other free-text badges where the label alone isn't always
 * enough for someone unfamiliar with the term.
 *
 * Deliberately a client component (Tooltip needs one) with no `icon` prop:
 * always uses the tone's own default icon, rendered internally, because a
 * custom icon *component* can't be passed as a prop from a Server
 * Component across the client boundary — only serializable data can. If a
 * call site needs a specific icon without a tooltip, use `StatusBadge`.
 */
export function TooltipStatusBadge({
  tone,
  tooltip,
  className,
  children,
}: {
  tone: StatusTone;
  tooltip: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { badgeClass, icon: ToneIcon } = TONE[tone];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn(badgeClass, "cursor-help", className)}>
          <ToneIcon data-icon="inline-start" aria-hidden />
          {children}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
