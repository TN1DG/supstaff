import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { compareWelfare } from "@/lib/welfare-engine";
import { loadWelfareFacts, siteTimeZone } from "@/lib/welfare-queries";
import { snapshotAt } from "@/lib/welfare-snapshot";
import { ORG_GUARDRAILS } from "@/lib/welfare-policy";
import { METHOD_LABEL, OUTCOME_LABEL, welfareFormatters } from "@/lib/welfare";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WelfareRow } from "../../welfare/welfare-row";

const DAY = 24 * 3_600_000;

/** The resident's welfare plan, live status and the last week of checks. */
export async function WelfareCard({
  residentId,
  siteId,
  canEditPlan,
}: {
  residentId: string;
  siteId: string;
  canEditPlan: boolean;
}) {
  const now = new Date();
  const [facts, timeZone] = await Promise.all([
    loadWelfareFacts(siteId, new Date(now.getTime() - 7 * DAY), { residentId }),
    siteTimeZone(siteId),
  ]);
  const fmt = welfareFormatters(timeZone);
  const snap = snapshotAt(facts, now).sort((a, b) => compareWelfare(a.state, b.state))[0];
  if (!snap) return null;

  const plan = snap.plan;
  const current = facts.versions[0] ?? null;
  const tierName = plan ? current?.config.tiers.find((t) => t.key === plan.tierKey)?.name ?? "—" : null;
  const reviewOverdue =
    plan &&
    (!plan.reviewedAt ||
      now.getTime() - plan.reviewedAt.getTime() > ORG_GUARDRAILS.planReviewMonths * 30 * DAY);
  const recent = [...facts.contacts].reverse().slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Welfare checks</CardTitle>
        {canEditPlan && current ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/residents/${residentId}/welfare`}>{plan ? "Edit plan" : "Set up plan"}</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <WelfareRow
          snap={snap}
          now={now}
          timeZone={timeZone}
          canEditPlans={canEditPlan}
          showName={false}
        />

        <div className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
          <div className="space-y-2">
            <p className="font-medium">Plan</p>
            {plan ? (
              <dl className="space-y-1.5">
                <Item label="Risk tier">{tierName}</Item>
                <Item label="Ways to check">
                  {plan.contactMethods.map((m) => METHOD_LABEL[m]).join(", ") || "—"}
                </Item>
                {plan.howToCheck ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">{plan.howToCheck}</p>
                ) : null}
                <Item label="Agreed with resident">{plan.residentInvolved ? "Yes" : "No"}</Item>
                <Item label="Last reviewed">
                  {plan.reviewedAt ? fmt.date(plan.reviewedAt) : "Never"}
                  {reviewOverdue ? (
                    <StatusBadge tone="warning" icon={CalendarClock} className="ml-2">
                      Review due
                    </StatusBadge>
                  ) : null}
                </Item>
              </dl>
            ) : (
              <p className="text-muted-foreground">
                {current
                  ? "No plan yet. Every resident needs one — set it up with them."
                  : "Plans can be set up once the service's welfare rules are published."}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-medium">Last 7 days</p>
            {recent.length === 0 ? (
              <p className="text-muted-foreground">No checks logged.</p>
            ) : (
              <ul className="space-y-1">
                {recent.map((c) => (
                  <li key={c.id} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground">{fmt.when(c.happenedAt, now)}</span>
                    <span>
                      {OUTCOME_LABEL[c.outcome]} · {METHOD_LABEL[c.method].toLowerCase()}
                    </span>
                    {c.overdueMinutes ? (
                      <span className="text-warning-foreground">{c.overdueMinutes} min late</span>
                    ) : null}
                    {c.staffName ? <span className="text-muted-foreground">· {c.staffName}</span> : null}
                    {c.note ? <span className="w-full text-xs text-muted-foreground">{c.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
