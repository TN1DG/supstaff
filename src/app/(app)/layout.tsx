import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { navForRole } from "@/lib/nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * This layout wraps every authenticated route, so without `cache()` the site
 * lookup is a Neon round-trip on each navigation — for a name that changes
 * almost never. `requireStaff()` reads the JWT, so this is the only DB hit here.
 */
const siteName = cache(async (siteId: string) => {
  const site = await getDb().query.sites.findFirst({
    where: eq(sites.id, siteId),
    columns: { name: true },
  });
  return site?.name ?? "Supstaff";
});

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
  if (staff.mustChangePassword) redirect("/welcome");

  const name = await siteName(staff.siteId);

  return (
    <SidebarProvider>
      <AppSidebar
        sections={navForRole(staff.role)}
        siteName={name}
        staffName={staff.name}
        role={staff.role}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu name={staff.name} email={staff.email} />
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
