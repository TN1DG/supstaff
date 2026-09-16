import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { TONE, type StatusTone } from "@/lib/status-tone";

/**
 * A badge for a "situation" — always pairs the tone's color with its icon,
 * never color alone. Use this instead of a one-off `<Badge className="...">`
 * for anything that represents a status (dose outcome, round state,
 * resident status, …).
 *
 * Stays a plain (server-renderable) component deliberately: `icon` is a
 * component reference, and component references can't cross the
 * server→client boundary as props, so this must never become a client
 * component — most call sites are inside Server Components. For a
 * hover-tooltip version, use `TooltipStatusBadge` instead (it renders its
 * own icon as JSX before handing off to the client).
 */
export function StatusBadge({
  tone,
  icon,
  className,
  children,
}: {
  tone: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  const { badgeClass, icon: DefaultIcon } = TONE[tone];
  const ToneIcon = icon ?? DefaultIcon;
  return (
    <Badge className={cn(badgeClass, className)}>
      <ToneIcon data-icon="inline-start" aria-hidden />
      {children}
    </Badge>
  );
}
