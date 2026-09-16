import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers, nightCheckRounds, residents } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { currentNightOf } from "@/lib/night-checks";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_LINKS = [
  {
    href: "/handovers/new",
    icon: "NotebookPen",
    title: "Write a handover",
    body: "Record how the shift went, resident by resident.",
  },
  {
    href: "/handovers",
    icon: "LayoutDashboard",
    title: "Read the last handover",
    body: "Catch up on what happened before you came on.",
  },
  {
    href: "/residents",
    icon: "Users",
    title: "Residents",
    body: "Rooms, key workers and support notes.",
  },
];

export default async function TodayPage() {
  const staff = await requireStaff();
  const db = getDb();
  const firstName = staff.name.split(" ")[0] ?? staff.name;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const checkDate = currentNightOf(new Date());

  const [residentCount, todaysHandovers, tonightRounds] = await Promise.all([
    db.$count(residents, and(eq(residents.siteId, staff.siteId), eq(residents.status, "active"))),
    db.$count(
      handovers,
      and(
        eq(handovers.siteId, staff.siteId),
        gte(handovers.createdAt, startOfDay),
      ),
    ),
    db.query.nightCheckRounds.findMany({
      where: and(
        eq(nightCheckRounds.siteId, staff.siteId),
        eq(nightCheckRounds.checkDate, checkDate),
      ),
      columns: { id: true, roundTime: true, status: true },
    }),
  ]);

  const inProgressRound = tonightRounds.find((r) => r.status === "in_progress");
  const nightCheckLink = inProgressRound
    ? {
        href: `/night-checks/${inProgressRound.id}`,
        icon: "MoonStar",
        title: "Continue the night check",
        body: `You're partway through the ${inProgressRound.roundTime} round — pick up where you left off.`,
      }
    : {
        href: "/night-checks",
        icon: "MoonStar",
        title: "Do the night check",
        body: "Check in on the building any time during your shift — no need to wait for the scheduled time.",
      };

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {residentCount} resident{residentCount === 1 ? "" : "s"} in the house
          today · {todaysHandovers} handover{todaysHandovers === 1 ? "" : "s"} so
          far.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[nightCheckLink, ...QUICK_LINKS].map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/30">
              <CardHeader>
                <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon name={link.icon} className="size-4.5" />
                </div>
                <CardTitle className="text-base">{link.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {link.body}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
