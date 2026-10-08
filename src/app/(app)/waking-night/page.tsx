import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { residents as residentsTable } from "@/db/schema";
import { requireCareStaff } from "@/lib/rbac";
import { localTime } from "@/lib/site-time";
import { ROUND_STATE_META } from "@/lib/night-checks";
import { loadShiftView } from "@/lib/waking-night/shift-view";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckInButton } from "../night-checks/check-in-button";
import { StartShiftButton } from "./start-shift-button";
import { RoundReasonForm } from "./round-reason-form";
import { ChecklistItemRow } from "./checklist-item-row";
import { SignOffDialog } from "./sign-off-dialog";
import { EventDialog, type ResidentOption } from "./event-dialog";
import { FollowUpRow, type FollowUpRowItem } from "./follow-up-row";
import { QuickReference } from "./quick-reference";

export const metadata: Metadata = { title: "Waking night" };

export default async function WakingNightPage() {
  const staffMember = await requireCareStaff();
  const view = await loadShiftView(staffMember.siteId);
  const { config, night, shift, rounds, items, events, blockers } = view;

  const residentOptions: ResidentOption[] = (
    await getDb().query.residents.findMany({
      where: and(
        eq(residentsTable.siteId, staffMember.siteId),
        eq(residentsTable.status, "active"),
      ),
      columns: { id: true, firstName: true, lastName: true, preferredName: true, room: true },
      orderBy: [asc(residentsTable.lastName)],
    })
  ).map((r) => ({
    id: r.id,
    name: `${r.preferredName ?? r.firstName} ${r.lastName}`,
    room: r.room,
  }));

  const tz = config.timezone;
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC", // `night` is a bare date — format it as-is
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const nightLabel = dateFmt.format(new Date(`${night}T00:00:00Z`));
  const signedOff = shift?.status === "signed_off";
  const followUpItem = (f: (typeof events)[number]["followUps"][number]): FollowUpRowItem => ({
    id: f.id,
    label: f.label,
    status: f.status,
    allowNa: f.allowNa,
    choices: f.choices,
    choice: f.choice,
    reason: f.reason,
    resolvedByName: f.resolvedBy?.name ?? null,
    resolvedAtLabel: f.resolvedAt ? timeFmt.format(f.resolvedAt) : null,
    link:
      f.sourceEntityType === "handover" && f.sourceEntityId
        ? { label: "Night handover", href: `/handovers/${f.sourceEntityId}` }
        : f.sourceEntityType === "maintenance_report"
          ? { label: "Urgent building report raised", href: "/maintenance" }
          : null,
  });
  const resolvedCount = items.filter((i) => i.status).length;

  return (
    <>
      <PageHeader
        title="Waking night"
        description="Welfare rounds, the end-of-shift checklist and sign-off — in place of the paper sheet."
      >
        {shift ? (
          <StatusBadge tone={signedOff ? "success" : "info"}>
            {signedOff ? "Signed off" : "Shift open"}
          </StatusBadge>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Shift header */}
        <Card>
          <CardContent className="grid content-start gap-4 py-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Night of</p>
              <p className="font-medium">{nightLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Staff on duty</p>
              <p className="font-medium">
                {shift?.startedBy?.name ?? staffMember.name}
                {shift?.startedBy && shift.startedBy.id !== staffMember.id ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · you&rsquo;re signed in as {staffMember.name}
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {signedOff ? "Signed off" : "Shift started"}
              </p>
              <p className="font-medium">
                {signedOff && shift?.signedOffAt
                  ? `${timeFmt.format(shift.signedOffAt)} by ${shift.signedOffBy?.name ?? "—"}`
                  : shift
                    ? timeFmt.format(shift.startedAt)
                    : "Not started"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <QuickReference config={config} />
          </CardContent>
        </Card>
      </div>

      {!shift ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <p className="max-w-xl text-sm text-muted-foreground">
              Starting the shift sets up tonight&rsquo;s welfare rounds at{" "}
              {config.roundTimes.join(", ")} and opens the checklist. Each round
              should be done within {config.roundToleranceMinutes} minutes of
              its time.
            </p>
            <StartShiftButton />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Welfare rounds */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Welfare rounds</CardTitle>
              <p className="text-sm text-muted-foreground">
                Floor-level walk only — no room entry. On time means within{" "}
                {config.roundToleranceMinutes} minutes either side.
              </p>
            </CardHeader>
            <CardContent className="divide-y">
              {rounds.map((slot) => {
                const round = slot.row;
                const meta = ROUND_STATE_META[slot.state];
                return (
                  <div key={slot.roundTime} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-14 font-medium">{slot.roundTime}</span>
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        {round?.completedAt ? (
                          <span className="text-sm text-muted-foreground">
                            Done {timeFmt.format(round.completedAt)} by{" "}
                            {round.completedBy?.name ?? "—"}
                            {round.floorsCovered?.length
                              ? ` · floors ${round.floorsCovered.join(", ")}`
                              : ""}
                          </span>
                        ) : round?.startedAt ? (
                          <span className="text-sm text-muted-foreground">
                            Started {timeFmt.format(round.startedAt)} by {round.staff?.name ?? "—"}
                          </span>
                        ) : null}
                      </div>
                      {round && round.status !== "scheduled" ? (
                        <Link
                          href={`/night-checks/${round.id}`}
                          className="text-sm text-primary underline"
                        >
                          {round.status === "in_progress" ? "Continue" : "View"}
                        </Link>
                      ) : slot.state !== "missed" && !signedOff ? (
                        <CheckInButton
                          roundTime={slot.roundTime}
                          label={slot.state === "scheduled" ? "Check in early" : "Check in"}
                        />
                      ) : null}
                    </div>
                    {round?.observations ? (
                      <p className="pl-17 text-sm">
                        <span className="text-muted-foreground">Observed: </span>
                        {round.observations}
                      </p>
                    ) : null}
                    {round?.timelinessReason ? (
                      <p className="pl-17 text-sm">
                        <span className="text-muted-foreground">Reason: </span>
                        {round.timelinessReason}
                      </p>
                    ) : slot.reasonMissing && round && !signedOff ? (
                      <div className="pl-17">
                        <RoundReasonForm
                          roundId={round.id}
                          verdict={slot.timeliness === "late" ? "late" : "missed"}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Events and escalation follow-ups */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">Events &amp; follow-ups</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Repairs, incidents, ASB, a customer unwell, threats. Each
                  creates the follow-ups it needs; all must be resolved to sign off.
                </p>
              </div>
              {!signedOff ? (
                <EventDialog
                  shiftId={shift.id}
                  residents={residentOptions}
                  defaultTime={localTime(view.now, tz)}
                  quickReference={<QuickReference config={config} compact />}
                />
              ) : null}
            </CardHeader>
            <CardContent className="divide-y">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing logged tonight.</p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-14 font-medium">{timeFmt.format(e.occurredAt)}</span>
                      <span className="font-medium">{e.label}</span>
                      {e.severity === "serious" ? (
                        <StatusBadge tone="danger">Serious</StatusBadge>
                      ) : null}
                      {e.policeAttended ? <StatusBadge tone="info">Police attended</StatusBadge> : null}
                    </div>
                    <p className="pl-16 text-sm whitespace-pre-wrap">
                      {e.location ? <span className="text-muted-foreground">{e.location} · </span> : null}
                      {e.description}
                      <span className="text-muted-foreground"> — {e.loggedBy?.name ?? "—"}</span>
                    </p>
                    <ul className="divide-y pl-16">
                      {e.followUps.map((f) => (
                        <FollowUpRow key={f.id} item={followUpItem(f)} readOnly={signedOff} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Checklist */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Checklist{" "}
                <span className="font-normal text-muted-foreground">
                  · {resolvedCount} of {items.length} resolved
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Every item is either done, or not done with a reason.
              </p>
            </CardHeader>
            <CardContent className="divide-y">
              {items.map((item) => (
                <ChecklistItemRow
                  key={item.key}
                  shiftId={shift.id}
                  readOnly={signedOff}
                  item={{
                    key: item.key,
                    label: item.label,
                    kind: item.kind,
                    allowNa: item.allowNa,
                    source: item.source ?? null,
                    status: item.status,
                    resolvedBy: item.resolvedBy,
                    reason: item.reason,
                    evidence: item.evidence,
                    issues: item.issues,
                    resolvedByName: item.resolvedByName,
                    resolvedAtLabel: item.resolvedAt ? timeFmt.format(item.resolvedAt) : null,
                  }}
                />
              ))}
            </CardContent>
          </Card>

          {/* Sign-off */}
          {!signedOff ? (
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
                {blockers.length > 0 ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Before you can sign off:</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                      {blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Everything&rsquo;s resolved. Sign off to close the shift.
                  </p>
                )}
                <SignOffDialog shiftId={shift.id} disabled={blockers.length > 0} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
