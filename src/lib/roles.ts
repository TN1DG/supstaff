import type { StaffRole } from "@/db/schema";

// Client-safe role constants — no server-only imports here.

/**
 * The care ladder: bank staff < support officer < manager. The housing
 * officer is deliberately off it (rank 0), so every `requireRole(...)` /
 * `assertRole(...)` check — all at bank_staff or above — already excludes
 * them. Building access is granted separately via `canManageBuilding`.
 */
export const ROLE_RANK: Record<StaffRole, number> = {
  housing_officer: 0,
  bank_staff: 1,
  support_officer: 2,
  manager: 3,
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  bank_staff: "Bank staff",
  support_officer: "Support officer",
  manager: "Manager",
  housing_officer: "Housing officer",
};

export function hasRole(role: StaffRole, minRole: StaffRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** Handovers, medication, night-check rounds, residents — anything with resident data. */
export function canAccessCare(role: StaffRole): boolean {
  return hasRole(role, "bank_staff");
}

/** Triage building reports and see the building dashboard. */
export function canManageBuilding(role: StaffRole): boolean {
  return role === "housing_officer" || role === "manager";
}
