import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Circle,
  type LucideIcon,
} from "lucide-react";

/**
 * The app-wide status vocabulary. Every colored badge/alert for a
 * "situation" (a dose outcome, a round status, a resident status, …)
 * should map to one of these five, not invent its own color.
 *
 * - success: good / done / nothing wrong
 * - info:    informational / in progress / a standing classification,
 *            nothing urgent to do right now
 * - warning: needs attention / review
 * - danger:  missed / failed / locked out / a real problem
 * - neutral: not applicable yet / inactive / historical
 */
export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

export const TONE: Record<StatusTone, { badgeClass: string; icon: LucideIcon }> = {
  success: {
    badgeClass: "border-success/40 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  info: {
    badgeClass: "border-accent/50 bg-accent/20 text-accent-foreground",
    icon: Info,
  },
  warning: {
    badgeClass: "border-warning/40 bg-warning/15 text-warning",
    icon: AlertTriangle,
  },
  danger: {
    badgeClass: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  neutral: {
    badgeClass: "border-border bg-muted text-muted-foreground",
    icon: Circle,
  },
};
