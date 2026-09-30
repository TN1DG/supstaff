import type { StaffRole } from "@/db/schema";
import { ROLE_RANK, canAccessCare, canManageBuilding } from "@/lib/roles";

export type NavItem = {
  title: string;
  href: string;
  icon: string; // lucide icon name
  minRole?: StaffRole;
  /**
   * `care` items carry resident data and are hidden from the housing officer;
   * `building` items are for the housing officer and manager only.
   */
  audience?: "care" | "building";
  soon?: boolean;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV: NavSection[] = [
  {
    label: "Shift",
    items: [
      { title: "Today", href: "/", icon: "LayoutDashboard", audience: "care" },
      {
        title: "Handovers",
        href: "/handovers",
        icon: "NotebookPen",
        audience: "care",
      },
      { title: "Medication", href: "/medication", icon: "Pill", audience: "care" },
      {
        title: "Night checks",
        href: "/night-checks",
        icon: "MoonStar",
        audience: "care",
      },
      {
        title: "Report an issue",
        href: "/maintenance",
        icon: "Wrench",
      },
    ],
  },
  {
    label: "Building",
    items: [
      {
        title: "Building dashboard",
        href: "/building",
        icon: "Building2",
        audience: "building",
      },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Residents", href: "/residents", icon: "Users", audience: "care" },
    ],
  },
  {
    label: "Manager",
    items: [
      {
        title: "Insights",
        href: "/insights",
        icon: "ChartNoAxesColumn",
        minRole: "manager",
        soon: true,
      },
      {
        title: "Medication reports",
        href: "/medication/reports",
        icon: "ClipboardList",
        minRole: "manager",
      },
      {
        title: "Staff",
        href: "/staff",
        icon: "IdCard",
        minRole: "manager",
      },
      {
        title: "Audit log",
        href: "/audit",
        icon: "ScrollText",
        minRole: "manager",
      },
    ],
  },
];

export function navForRole(role: StaffRole): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole]) &&
        (item.audience !== "care" || canAccessCare(role)) &&
        (item.audience !== "building" || canManageBuilding(role)),
    ),
  })).filter((section) => section.items.length > 0);
}
