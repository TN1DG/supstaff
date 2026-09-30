import type {
  MaintenanceCategoryValue,
  MaintenancePriorityValue,
  MaintenanceStatusValue,
} from "@/db/schema";
import type { StatusTone } from "@/lib/status-tone";

// Client-safe display metadata for building reports — no server imports.

export const MAINTENANCE_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
] as const satisfies readonly MaintenanceStatusValue[];

export const MAINTENANCE_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly MaintenancePriorityValue[];

export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "heating",
  "fire_safety",
  "security",
  "structural",
  "appliance",
  "grounds",
  "other",
] as const satisfies readonly MaintenanceCategoryValue[];

/** The single source of truth for how a report status renders. */
export const MAINTENANCE_STATUS_META: Record<
  MaintenanceStatusValue,
  { tone: StatusTone; label: string }
> = {
  open: { tone: "warning", label: "Open" },
  acknowledged: { tone: "info", label: "Acknowledged" },
  in_progress: { tone: "info", label: "In progress" },
  resolved: { tone: "success", label: "Resolved" },
};

/** `urgent` uses the danger tone, which the theme renders as coral — never a harsh red. */
export const MAINTENANCE_PRIORITY_META: Record<
  MaintenancePriorityValue,
  { tone: StatusTone; label: string }
> = {
  low: { tone: "neutral", label: "Low" },
  normal: { tone: "neutral", label: "Normal" },
  high: { tone: "warning", label: "High" },
  urgent: { tone: "danger", label: "Urgent" },
};

export const MAINTENANCE_CATEGORY_LABEL: Record<MaintenanceCategoryValue, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  heating: "Heating & hot water",
  fire_safety: "Fire safety",
  security: "Doors, locks & security",
  structural: "Walls, floors & windows",
  appliance: "Appliances",
  grounds: "Grounds & outside",
  other: "Other",
};

/** Whole days between two instants, never negative. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}
