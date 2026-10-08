import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { nightCheckRounds, nightCheckTemplateItems } from "@/db/schema";
import { requireCareStaff } from "@/lib/rbac";
import { hasRole } from "@/lib/roles";
import { ROUND_STATE_META } from "@/lib/night-checks";
import { getSiteConfig } from "@/lib/site-settings";
import { addDays, nightOf } from "@/lib/site-time";
import { buildRoundSchedule, mergeNightRounds } from "@/lib/waking-night/rounds";
import { loadNightRounds } from "@/lib/waking-night/round-store";
import type { StatusTone } from "@/lib/status-tone";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckInButton } from "./check-in-button";

export const metadata: Metadata = { title: "Night checks" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

function nightsBack(n: number, from: string): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, -i));
}

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  info: "bg-accent",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/25",
};

export default async function NightChecksPage() {
  const staffMember = await requireCareStaff();
  const isManager = hasRole(staffMember.role, "manager");
  const db = getDb();
  const now = new Date();
  const config = await getSiteConfig(staffMember.siteId);
  const checkDate = nightOf(now, config.timezone);

  const [tonightRounds, activeItems] = await Promise.all([
    loadNightRounds(staffMember.siteId, checkDate, config, now),
    db.query.nightCheckTemplateItems.findMany({
      where: and(
        eq(nightCheckTemplateItems.siteId, staffMember.siteId),
        eq(nightCheckTemplateItems.active, true),
      ),
      columns: { id: true },
    }),
  ]);

  const nights = nightsBack(7, checkDate);
  const gridRounds = isManager
    ? await db.query.nightCheckRounds.findMany({
        where: and(
          eq(nightCheckRounds.siteId, staffMember.siteId),
          inArray(nightCheckRounds.checkDate, nights),
        ),
        columns: {
          checkDate: true,
          roundTime: true,
          status: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          timelinessReason: true,
        },
      })
    : [];
  const gridStates = new Map(
    nights.map((night) => {
      const merged = mergeNightRounds(
        buildRoundSchedule(config.roundTimes, night, config.timezone),
        gridRounds.filter((r) => r.checkDate === night),
        config.roundToleranceMinutes,
        now,
      );
      return [night, new Map(merged.map((r) => [r.roundTime, r.state]))];
    }),
  );

  return (
    <>
      <PageHeader
        title="Night checks"
        description={`Welfare rounds at ${config.roundTimes.join(", ")} — a floor-level walk, no room entry. Complete each within ${config.roundToleranceMinutes} minutes of its time; anything outside that needs a reason.`}
      >
        {isManager ? (
          <Button variant="outline" asChild>
            <Link href="/night-checks/template">Manage checklist</Link>
          </Button>
        ) : null}
      </PageHeader>

      {activeItems.length === 0 ? (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            No checklist items are set up yet.{" "}
            {isManager ? (
              <Link href="/night-checks/template" className="text-primary underline">
                Add some
              </Link>
            ) : (
              "Ask a manager to set one up."
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Tonight &middot; {dateFmt.format(new Date(`${checkDate}T00:00:00`))}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {tonightRounds.map((slot) => {
            const round = slot.row;
            const meta = ROUND_STATE_META[slot.state];
            const started = round?.status === "in_progress" || round?.status === "complete";
            return (
              <div
                key={slot.roundTime}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="w-14 font-medium">{slot.roundTime}</span>
                  {slot.state === "scheduled" ? (
                    <span className="text-sm text-muted-foreground">Not due yet</span>
                  ) : (
                    <StatusBadge tone={meta.tone}>
                      {meta.label}
                      {round?.staff?.name && started ? ` · ${round.staff.name}` : ""}
                    </StatusBadge>
                  )}
                  {slot.reasonMissing ? (
                    <span className="text-xs text-warning">Reason needed</span>
                  ) : null}
                </div>
                {round && round.status !== "scheduled" ? (
                  <Link href={`/night-checks/${round.id}`} className="text-sm text-primary underline">
                    {round.status === "in_progress" ? "Continue" : "View"}
                  </Link>
                ) : slot.state === "missed" ? (
                  <Link href="/waking-night" className="text-sm text-primary underline">
                    Give a reason
                  </Link>
                ) : (
                  <CheckInButton
                    roundTime={slot.roundTime}
                    label={slot.state === "scheduled" ? "Check in early" : "Check in"}
                  />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 7 nights</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4 font-normal">Night</th>
                  {config.roundTimes.map((rt) => (
                    <th key={rt} className="px-2 py-1 text-center font-normal">
                      {rt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nights.map((night) => (
                  <tr key={night} className="border-t">
                    <td className="py-2 pr-4">
                      {dateFmt.format(new Date(`${night}T00:00:00`))}
                    </td>
                    {config.roundTimes.map((rt) => {
                      const state = gridStates.get(night)?.get(rt) ?? "scheduled";
                      return (
                        <td key={rt} className="px-2 py-2 text-center">
                          <span
                            className={`mx-auto block size-2.5 rounded-full ${DOT_CLASS[ROUND_STATE_META[state].tone]}`}
                            title={ROUND_STATE_META[state].label}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
