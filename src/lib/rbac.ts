import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { ROLE_RANK } from "@/lib/roles";
import type { StaffRole } from "@/db/schema";

export { ROLE_RANK, ROLE_LABEL, hasRole } from "@/lib/roles";

export type SessionStaff = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  siteId: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

function toStaff(u: Session["user"]): SessionStaff {
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    siteId: u.siteId,
    isAdmin: u.isAdmin,
    mustChangePassword: u.mustChangePassword,
  };
}

/** Require a signed-in staff member. Redirects to /login otherwise. */
export async function requireStaff(): Promise<SessionStaff> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return toStaff(session.user);
}

/** Require a signed-in staff member with at least the given role. */
export async function requireRole(minRole: StaffRole): Promise<SessionStaff> {
  const staff = await requireStaff();
  if (ROLE_RANK[staff.role] < ROLE_RANK[minRole]) redirect("/denied");
  return staff;
}

/** Require the technical admin flag (integration / setup screens). */
export async function requireAdmin(): Promise<SessionStaff> {
  const staff = await requireStaff();
  if (!staff.isAdmin && staff.role !== "manager") redirect("/denied");
  return staff;
}

/** For server actions — throws instead of redirecting. */
export async function assertStaff(): Promise<SessionStaff> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return toStaff(session.user);
}

export async function assertRole(minRole: StaffRole): Promise<SessionStaff> {
  const staff = await assertStaff();
  if (ROLE_RANK[staff.role] < ROLE_RANK[minRole]) {
    throw new Error("Insufficient permissions");
  }
  return staff;
}

/**
 * Auth gate for Route Handlers: returns the staff member, or a 401/403
 * `Response` to hand straight back. Pass `minRole` to require a role.
 *
 *   const staff = await guardRoute("manager");
 *   if (staff instanceof Response) return staff;
 */
export async function guardRoute(
  minRole?: StaffRole,
): Promise<SessionStaff | Response> {
  try {
    return minRole ? await assertRole(minRole) : await assertStaff();
  } catch {
    return minRole
      ? new Response("Forbidden", { status: 403 })
      : new Response("Unauthorized", { status: 401 });
  }
}
