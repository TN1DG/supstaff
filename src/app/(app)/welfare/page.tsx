import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Info, ScrollText } from "lucide-react";
import { requireCareStaff } from "@/lib/rbac";
import { hasRole } from "@/lib/roles";
import { compareWelfare } from "@/lib/welfare-engine";
import { canEditWelfareRules, loadWelfareFacts, siteTimeZone } from "@/lib/welfare-queries";
import { countByKind, snapshotAt, versionAt } from "@/lib/welfare-snapshot";
import { ORG_GUARDRAILS } from "@/lib/welfare-policy";
import { WELFARE_STATUS_META, welfareFormatters } from "@/lib/welfare";
import { addDays, zonedDate } from "@/lib/zoned-time";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WelfareRow } from "./welfare-row";

export const metadata: Metadata = { title: "Welfare checks" };

const DAY = 24 * 3_600_000;

export default async function WelfarePage() {
  const staff = await requireCareStaff();
  const now = new Date();
  const [facts, timeZone, canEditRules] = await Promise.all([
    loadWelfareFacts(staff.siteId, new Date(now.getTime() - DAY)),
    siteTimeZone(staff.siteId),
    canEditWelfareRules(staff),
  ]);
  const fmt = welfareFormatters(timeZone);
  const canEditPlans = hasRole(staff.role, "support_officer");

  const rows = snapshotAt(facts, now).sort((a, b) => compareWelfare(a.state, b.state));
  const counts = countByKind(rows);
  const needsAction = rows.filter((r) => r.state.kind === "escalating" || r.state.kind === "overdue");
  const others = rows.filter((r) => !needsAction.includes(r));

  const current = versionAt(facts.versions, now);
  const previous = current ? facts.versions.find((v) => v.version === current.version - 1) : undefined;
  // A republish with no changes is a review, not news for staff.
  const actuallyChanged =
    !previous || JSON.stringify(previous.config) !== JSON.stringify(current?.config);
  const recentlyChanged =
    current &&
    actuallyChanged &&
    now.getTime() - current.publishedAt.getTime() < ORG_GUARDRAILS.ruleChangeBannerDays * DAY
      ? current
      : null;
  const today = zonedDate(now, timeZone);
  const reviewDue =
    current && canEditRules && current.reviewDueOn <= addDays(today, ORG_GUARDRAILS.rulesReviewWarningDays)
      ? current
      : null;
  const planReviewCutoff = now.getTime() - ORG_GUARDRAILS.planReviewMonths * 30 * DAY;
  const plansNeedingReview = rows.filter(
    (r) => r.plan && (!r.plan.reviewedAt || r.plan.reviewedAt.getTime() < planReviewCutoff),
  ).length;

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader
        title="Welfare checks"
        description="Who needs seeing, who's overdue and what to do next — most urgent first."
      >
        <Button variant="outline" asChild>
          <Link href="/welfare/rules">
            <ScrollText aria-hidden />
            Welfare rules
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-6 space-y-3">
        {!current ? (
          <Alert variant="warning">
            <Info />
            <AlertTitle>No welfare rules yet</AlertTitle>
            <AlertDescription>
              {canEditRules ? (
                <>
                  Statuses and escalation steps appear once the service&rsquo;s rules
                  are published.{" "}
                  <Link href="/welfare/rules/edit" className="underline">
                    Set them up
                  </Link>{" "}
                  — you&rsquo;ll start from the organisation default.
                </>
              ) : (
                "Ask the manager to publish the service's welfare rules. You can still log checks."
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {recentlyChanged ? (
          <Alert variant="info">
            <Info />
            <AlertTitle>
              Welfare rules changed {fmt.when(recentlyChanged.publishedAt, now)}
              {recentlyChanged.publishedByName ? ` by ${recentlyChanged.publishedByName}` : ""}
            </AlertTitle>
            <AlertDescription>
              &ldquo;{recentlyChanged.changeNote}&rdquo;{" "}
              <Link href="/welfare/rules" className="underline">
                See the rules
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {reviewDue ? (
          <Alert variant="warning">
            <CalendarClock />
            <AlertTitle>
              {reviewDue.reviewDueOn < today ? "Welfare rules are past their review date" : "Welfare rules are due for review"}
            </AlertTitle>
            <AlertDescription>
              Review date {fmt.date(new Date(`${reviewDue.reviewDueOn}T12:00:00Z`))}.{" "}
              <Link href="/welfare/rules/edit" className="underline">
                Review and republish
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["escalating", "overdue", "due_soon", "no_plan", "ok", "away"] as const).map((k) => (
          <StatusBadge key={k} tone={counts[k] > 0 ? WELFARE_STATUS_META[k].tone : "neutral"}>
            {counts[k]} {WELFARE_STATUS_META[k].label.toLowerCase()}
          </StatusBadge>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Updated {fmt.time(now)} · refreshes every minute
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No residents yet.
          </CardContent>
        </Card>
      ) : null}

      {needsAction.length > 0 ? (
        <section className="mb-6 space-y-3" aria-labelledby="needs-action">
          <h2 id="needs-action" className="text-sm font-medium text-muted-foreground">
            Needs action now
          </h2>
          {needsAction.map((snap) => (
            <Card
              key={snap.resident.id}
              className={snap.state.kind === "escalating" ? "border-destructive/40" : "border-warning/50"}
            >
              <CardContent>
                <WelfareRow snap={snap} now={now} timeZone={timeZone} canEditPlans={canEditPlans} />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {others.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {needsAction.length > 0 ? "Everyone else" : "Everyone"}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {others.map((snap) => (
              <WelfareRow
                key={snap.resident.id}
                snap={snap}
                now={now}
                timeZone={timeZone}
                canEditPlans={canEditPlans}
                compact
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canEditPlans && plansNeedingReview > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {plansNeedingReview} welfare plan{plansNeedingReview === 1 ? " hasn't" : "s haven't"} been
          reviewed with the resident in the last {ORG_GUARDRAILS.planReviewMonths} months — open the
          resident to review.
        </p>
      ) : null}
    </>
  );
}
