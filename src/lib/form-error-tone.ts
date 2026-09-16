import { Lock, Info, XCircle, type LucideIcon } from "lucide-react";
import type { StatusTone } from "@/lib/status-tone";

/**
 * Classifies a server action's error string for consistent icon/tone
 * display — lets "PIN not set" (a setup nudge, not a failure), "locked out"
 * (a real lockout), and "wrong PIN" (an ordinary mistake) look different
 * from each other even though `pinCheck` only returns plain strings.
 */
export function classifyFormError(message: string): { tone: StatusTone; icon: LucideIcon } {
  if (/set a signing pin/i.test(message)) return { tone: "info", icon: Info };
  if (/too many wrong pins/i.test(message)) return { tone: "danger", icon: Lock };
  return { tone: "danger", icon: XCircle };
}
