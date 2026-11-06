import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, History, Info } from "lucide-react";
import { requireCareStaff } from "@/lib/rbac";
import { canEditWelfareRules, listPolicyVersions, siteTimeZone } from "@/lib/welfare-queries";
import {
  ACTION_LABEL,
  CLOCK_START_LABEL,
  ORG_GUARDRAILS,
  describeStep,
  formatMinutes,
  minutesAfterDue,
  sortedSteps,
} from "@/lib/welfare-policy";
import { welfareFormatters } from "@/lib/welfare";
import { addDays, zonedDate } from "@/lib/zoned-time";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Welfare rules" };

export default async function WelfareRulesPage({ searchParams }: PageProps<"/welfare/rules">) {
  const staff = await requireCareStaff();
  const sp = await searchParams;
  const [versions, timeZone, canEdit] = await Promise.all([
    listPolicyVersions(staff.siteId),
    siteTimeZone(staff.siteId),
    canEditWelfareRules(staff),
  ]);
  const fmt = welfareFormatters(timeZone);
  const now = new Date();
  const today = zonedDate(now, timeZone);

  const current = versions[0] ?? null;
  const requested = typeof sp.v === "string" ? Number(sp.v) : null;
  const shown = (requested ? versions.find((v) => v.version === requested) : null) ?? current;
  const justPublished = typeof sp.published === "string" ? Number(sp.published) : null;
  const reviewDate = (d: string) => fmt.date(new Date(`${d}T12:00:00Z`));

  return (
    <>
      <PageHeader
        title="Welfare rules"
        description="How often each resident must be seen or contacted, and what staff do when they're not. Set by the service, inside the organisation's limits."
      >
        <Button variant="ghost" asChild>
          <Link href="/welfare">Back to the board</Link>
        </Button>
        {canEdit ? (
          <Button asChild>
            <Link href="/welfare/rules/edit">{current ? "Edit rules" : "Set up rules"}</Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-6 space-y-3">
        {justPublished && justPublished === current?.version ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Version {justPublished} is live</AlertTitle>
            <AlertDescription>
              Staff see a notice on the welfare board for the next {ORG_GUARDRAILS.ruleChangeBannerDays}{" "}
              days. Escalations already running keep the rules they started under.
            </AlertDescription>
          </Alert>
        ) : null}
        {shown && current && shown.version !== current.version ? (
          <Alert variant="info">
            <History />
            <AlertTitle>
              You&rsquo;re looking at version {shown.version}, in force from{" "}
              {fmt.dayTime(shown.publishedAt)}
            </AlertTitle>
            <AlertDescription>
              <Link href="/welfare/rules" className="underline">
                Back to the current rules (version {current.version})
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {!shown ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No welfare rules published yet</p>
            <p className="mx-auto mt-1 max-w-md">
              {canEdit
                ? "Set them up from the organisation default — tiers, how often to check and the escalation steps."
                : "The manager or their deputy sets these up."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Version {shown.version}</span>
              <span>
                Published {fmt.dayTime(shown.publishedAt)}
                {shown.publishedByName ? ` by ${shown.publishedByName}` : ""}
              </span>
              {shown.reviewDueOn < today ? (
                <StatusBadge tone="danger" icon={CalendarClock}>
                  Review was due {reviewDate(shown.reviewDueOn)}
                </StatusBadge>
              ) : shown.reviewDueOn <= addDays(today, ORG_GUARDRAILS.rulesReviewWarningDays) ? (
                <StatusBadge tone="warning" icon={CalendarClock}>
                  Review by {reviewDate(shown.reviewDueOn)}
                </StatusBadge>
              ) : (
                <span>Review by {reviewDate(shown.reviewDueOn)}</span>
              )}
            </div>
            <p className="text-sm">&ldquo;{shown.changeNote}&rdquo;</p>

            {shown.config.tiers.map((tier) => (
              <Card key={tier.key}>
                <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">{tier.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    Seen or contacted at least every {formatMinutes(tier.intervalMinutes)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">
                          {tier.clockStart === "last_seen" ? "Since last seen" : "After overdue"}
                        </TableHead>
                        <TableHead className="w-36">Step</TableHead>
                        <TableHead>What staff do</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSteps(tier).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="align-top">
                            {tier.clockStart === "due" && minutesAfterDue(tier, s) === 0
                              ? "As soon as overdue"
                              : formatMinutes(s.afterMinutes)}
                          </TableCell>
                          <TableCell className="align-top font-medium">{ACTION_LABEL[s.action]}</TableCell>
                          <TableCell className="whitespace-normal align-top">{s.instruction}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {sortedSteps(tier).map((s) => (
                      <li key={s.id}>{describeStep(tier, s)}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Step times are written as: {CLOCK_START_LABEL[tier.clockStart].toLowerCase()}.
                    After a planned absence, steps count from the time they were due back.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="size-4 text-muted-foreground" aria-hidden />
                  Organisation limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Every service&rsquo;s rules must stay inside these:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Check at least every {formatMinutes(ORG_GUARDRAILS.maxIntervalMinutes)}</li>
                  <li>
                    Inform on-call within {formatMinutes(ORG_GUARDRAILS.onCallWithinMinutesOfOverdue)} of
                    a check becoming overdue
                  </li>
                  <li>
                    Report missing within{" "}
                    {formatMinutes(ORG_GUARDRAILS.reportMissingWithinMinutesOfOverdue)} of a check
                    becoming overdue
                  </li>
                  <li>
                    Up to {ORG_GUARDRAILS.maxTiers} tiers and {ORG_GUARDRAILS.maxStepsPerTier} steps per
                    tier
                  </li>
                </ul>
                <p className="text-xs">Placeholder values until the Missing Persons Procedure timescales are confirmed.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {versions.map((v) => (
                  <div key={v.id} className="space-y-0.5">
                    <p className="flex items-center gap-2">
                      {v.version === shown.version ? (
                        <span className="font-medium">Version {v.version}</span>
                      ) : (
                        <Link href={`/welfare/rules?v=${v.version}`} className="font-medium underline">
                          Version {v.version}
                        </Link>
                      )}
                      {v.version === current?.version ? <Badge variant="outline">current</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.dayTime(v.publishedAt)}
                      {v.publishedByName ? ` · ${v.publishedByName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.changeNote}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
