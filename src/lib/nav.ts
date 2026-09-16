import type { StaffRole } from "@/db/schema";
import { ROLE_RANK } from "@/lib/roles";

export type NavItem = {
  title: string;
  href: string;
  icon: string; // lucide icon name
  minRole?: StaffRole;
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
      { title: "Today", href: "/", icon: "LayoutDashboard" },
      { title: "Handovers", href: "/handovers", icon: "NotebookPen" },
      { title: "Medication", href: "/medication", icon: "Pill" },
      {
        title: "Night checks",
        href: "/night-checks",
        icon: "MoonStar",
      },
      {
        title: "Building reports",
        href: "/maintenance",
        icon: "Wrench",
        soon: true,
      },
    ],
  },
  {
    label: "People",
    items: [{ title: "Residents", href: "/residents", icon: "Users" }],
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
      (item) => !item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole],
    ),
  })).filter((section) => section.items.length > 0);
}
