import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { nightCheckRounds, nightCheckTemplateItems } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { hasRole } from "@/lib/roles";
import {
  ROUND_STATUS_META,
  ROUND_TIMES,
  currentNightOf,
  displayRoundStatus,
  isoDate,
} from "@/lib/night-checks";
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
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) {
    out.push(isoDate(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  info: "bg-accent",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/25",
};

export default async function NightChecksPage() {
  const staffMember = await requireStaff();
  const isManager = hasRole(staffMember.role, "manager");
  const db = getDb();
  const now = new Date();
  const checkDate = currentNightOf(now);

  const [tonightRounds, activeItems] = await Promise.all([
    db.query.nightCheckRounds.findMany({
      where: and(
        eq(nightCheckRounds.siteId, staffMember.siteId),
        eq(nightCheckRounds.checkDate, checkDate),
      ),
      with: { staff: { columns: { name: true } } },
    }),
    db.query.nightCheckTemplateItems.findMany({
      where: and(
        eq(nightCheckTemplateItems.siteId, staffMember.siteId),
        eq(nightCheckTemplateItems.active, true),
      ),
      columns: { id: true },
    }),
  ]);

  const byRoundTime = new Map(tonightRounds.map((r) => [r.roundTime, r]));

  const nights = nightsBack(7, checkDate);
  const gridRounds = isManager
    ? await db.query.nightCheckRounds.findMany({
        where: and(
          eq(nightCheckRounds.siteId, staffMember.siteId),
          inArray(nightCheckRounds.checkDate, nights),
        ),
        columns: { checkDate: true, roundTime: true, status: true },
      })
    : [];
  const gridLookup = new Map(
    gridRounds.map((r) => [`${r.checkDate}|${r.roundTime}`, r.status]),
  );

  return (
    <>
      <PageHeader
        title="Night checks"
        description="Rounds run every two hours from 11pm to 7am, but you can check in any time during your shift — no need to wait. Each round builds a timestamped checklist for the manager."
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
          {ROUND_TIMES.map((rt) => {
            const round = byRoundTime.get(rt);
            const status = displayRoundStatus(checkDate, rt, round?.status ?? null, now);
            return (
              <div
                key={rt}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="w-14 font-medium">{rt}</span>
                  {status === "not_due" ? (
                    <span className="text-sm text-muted-foreground">Not due yet</span>
                  ) : (
                    <StatusBadge tone={ROUND_STATUS_META[status].tone}>
                      {ROUND_STATUS_META[status].label}
                      {round?.staff?.name && (status === "in_progress" || status === "complete")
                        ? ` · ${round.staff.name}`
                        : ""}
                    </StatusBadge>
                  )}
                </div>
                {round ? (
                  <Link href={`/night-checks/${round.id}`} className="text-sm text-primary underline">
                    {round.status === "in_progress" ? "Continue" : "View"}
                  </Link>
                ) : (
                  <CheckInButton
                    roundTime={rt}
                    label={status === "not_due" ? "Check in early" : "Check in"}
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
                  {ROUND_TIMES.map((rt) => (
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
                    {ROUND_TIMES.map((rt) => {
                      const stored = gridLookup.get(`${night}|${rt}`) ?? null;
                      const status = displayRoundStatus(night, rt, stored, now);
                      return (
                        <td key={rt} className="px-2 py-2 text-center">
                          <span
                            className={`mx-auto block size-2.5 rounded-full ${DOT_CLASS[ROUND_STATUS_META[status].tone]}`}
                            title={ROUND_STATUS_META[status].label}
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
