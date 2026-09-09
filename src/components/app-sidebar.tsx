"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/icon";
import type { NavSection } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/roles";
import type { StaffRole } from "@/db/schema";

export function AppSidebar({
  sections,
  siteName,
  staffName,
  role,
}: {
  sections: NavSection[];
  siteName: string;
  staffName: string;
  role: StaffRole;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar>
      <SidebarHeader className="gap-0.5 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden>
              <path
                d="M20 4C10 4 4 10 4 20c8 0 16-5 16-16Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Supstaff</p>
            <p className="text-xs text-muted-foreground">{siteName}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <Icon name={item.icon} className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.soon ? (
                      <SidebarMenuBadge className="text-muted-foreground">
                        soon
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2 text-xs">
          <p className="font-medium text-sidebar-accent-foreground">
            {staffName}
          </p>
          <p className="text-muted-foreground">{ROLE_LABEL[role]}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
