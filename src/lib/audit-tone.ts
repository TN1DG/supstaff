import type { StatusTone } from "@/lib/status-tone";

/**
 * Best-effort category for an audit action, purely for the badge color on
 * `/audit` — the action string itself (e.g. `medication.administer`) is
 * never parsed for anything functional. Security-sensitive actions
 * (PIN/password) are checked first so they always stand out regardless of
 * their verb suffix.
 */
export function categorizeAuditAction(action: string): StatusTone {
  if (/pin|password/i.test(action)) return "danger";
  if (action.endsWith(".archive")) return "warning";
  if (action.endsWith(".restore") || action.endsWith(".update")) return "info";
  return "success";
}
