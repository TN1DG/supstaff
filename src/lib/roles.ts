import type { StaffRole } from "@/db/schema";

// Client-safe role constants — no server-only imports here.

export const ROLE_RANK: Record<StaffRole, number> = {
  bank_staff: 1,
  support_officer: 2,
  manager: 3,
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  bank_staff: "Bank staff",
  support_officer: "Support officer",
  manager: "Manager",
};

export function hasRole(role: StaffRole, minRole: StaffRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}
