import Link from "next/link";
import { CheckCircle2, Circle, CircleAlert, Clock } from "lucide-react";
import { cn } from "cn";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  METHOD_LABEL,
  OUTCOME_LABEL,
  WELFARE_STATUS_META,
  durationBetween,
  noPlanMessage,
  welfareFormatters,
} from "@/lib/welfare";
import { ACTION_LABEL } from "@/lib/welfare-policy";
import type { ResidentSnapshot } from "@/lib/welfare-snapshot";
import { toLocalDateTimeValue } from "@/lib/zoned-time";
import { LogCheckDialog } from "./log-check-dialog";
import { EscalationActionDialog, type DialogStep } from "./escalation-action-dialog";
import { AbsenceActionButton, ChangeReturnDialog, CreateAbsenceDialog } from "./absence-dialogs";

type Fmt = ReturnType<typeof welfareFormatters>;

/** The one-line "where are they at" next to the status badge. */
function statusDetail(snap: ResidentSnapshot, now: Date, fmt: Fmt): string {
  const s = snap.state;
  switch (s.kind) {
    case "escalating": {
      const step = s.currentStepIndex !== null ? s.steps[s.currentStepIndex] : null;
      return step
        ? `Step ${s.currentStepIndex! + 1} of ${s.steps.length}: ${ACTION_LABEL[step.action]}`
        : "Escalating";
    }
    case "overdue":
      return `Overdue since ${fmt.when(s.dueAt!, now)} · ${durationBetween(s.dueAt!, now)}`;
    case "due_soon":
      return `Due at ${fmt.time(s.dueAt!)} · in ${durationBetween(now, s.dueAt!)}`;
    case "ok":
      return `Next check by ${fmt.when(s.dueAt!, now)}`;
    case "no_plan":
      return noPlanMessage(s.reason);
    case "away":
      return s.reason === "on_leave"
        ? "On leave — no checks while they're away"
        : `Away until ${fmt.when(s.awayUntil!, now)}`;
  }
}

function lastSeenLine(snap: ResidentSnapshot, now: Date, fmt: Fmt): string {
  const r = snap.lastReset;
  if (!r) return snap.plan ? "Not seen or contacted since their plan started" : "No checks logged yet";
  return `Last ${OUTCOME_LABEL[r.outcome].toLowerCase()} ${fmt.when(r.happenedAt, now)} (${durationBetween(r.happenedAt, now)} ago) · ${METHOD_LABEL[r.method].toLowerCase()}${r.staffName ? ` · ${r.staffName}` : ""}`;
}

export function WelfareRow({
  snap,
  now,
  timeZone,
  canEditPlans,
  compact = false,
  showName = true,
}: {
  snap: ResidentSnapshot;
  now: Date;
  timeZone: string;
  canEditPlans: boolean;
  /** Inside a list card rather than its own card. */
  compact?: boolean;
  /** Off on the resident's own page, where the name is the page title. */
  showName?: boolean;
}) {
  const fmt = welfareFormatters(timeZone);
  const { state, resident } = snap;
  const meta = WELFARE_STATUS_META[state.kind];
  const needsAction = state.kind === "overdue" || state.kind === "escalating";
  const lastTry =
    snap.lastCheck && snap.lastCheck.outcome === "no_response" && snap.lastCheck.id !== snap.lastReset?.id
      ? snap.lastCheck
      : null;

  return (
    <div className={cn(compact ? "py-3 first:pt-0 last:pb-0" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {showName ? (
              <Link href={`/residents/${resident.id}`} className="font-medium hover:underline">
                {snap.name}
              </Link>
            ) : null}
            {showName && resident.room ? (
              <span className="text-sm text-muted-foreground">Room {resident.room}</span>
            ) : null}
            {state.tier ? (
              <Badge variant="outline" className="font-normal">
                {state.tier.name}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            <span className={needsAction ? "font-medium" : "text-muted-foreground"}>
              {statusDetail(snap, now, fmt)}
            </span>
          </div>
          {state.kind !== "away" ? (
            <p className="text-xs text-muted-foreground">{lastSeenLine(snap, now, fmt)}</p>
          ) : snap.absence?.reason ? (
            <p className="text-xs text-muted-foreground">{snap.absence.reason}</p>
          ) : null}
          {lastTry ? (
            <p className="text-xs text-muted-foreground">
              Tried {fmt.when(lastTry.happenedAt, now)}: no response
              {lastTry.staffName ? ` · ${lastTry.staffName}` : ""}
            </p>
          ) : null}
          {snap.upcomingAbsence ? (
            <p className="text-xs text-muted-foreground">
              Planned absence {fmt.when(snap.upcomingAbsence.startsAt, now)} to{" "}
              {fmt.when(snap.upcomingAbsence.expectedBackAt, now)}
              {snap.upcomingAbsence.reason ? ` · ${snap.upcomingAbsence.reason}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {state.kind === "away" && snap.absence ? (
            <>
              <AbsenceActionButton absenceId={snap.absence.id} kind="back" />
              <ChangeReturnDialog
                absenceId={snap.absence.id}
                residentName={snap.name}
                currentValue={toLocalDateTimeValue(snap.absence.expectedBackAt, timeZone)}
              />
              <AbsenceActionButton absenceId={snap.absence.id} kind="cancel" />
            </>
          ) : state.kind === "away" ? null : (
            <>
              {state.kind === "no_plan" && state.reason !== "no_rules" && canEditPlans ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/residents/${resident.id}/welfare`}>Set up plan</Link>
                </Button>
              ) : null}
              {!needsAction ? (
                <LogCheckDialog residentId={resident.id} residentName={snap.name} variant="outline" />
              ) : null}
              {!needsAction && !snap.upcomingAbsence ? (
                <CreateAbsenceDialog residentId={resident.id} residentName={snap.name} />
              ) : null}
              {snap.upcomingAbsence ? (
                <AbsenceActionButton absenceId={snap.upcomingAbsence.id} kind="cancel" />
              ) : null}
              {/* Past their expected return but the absence is still open —
                  e.g. they rang to say they're staying another night. */}
              {snap.absence && !needsAction ? (
                <ChangeReturnDialog
                  absenceId={snap.absence.id}
                  residentName={snap.name}
                  currentValue={toLocalDateTimeValue(snap.absence.expectedBackAt, timeZone)}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {needsAction ? <EscalationPanel snap={snap} now={now} fmt={fmt} /> : null}
    </div>
  );
}

function EscalationPanel({ snap, now, fmt }: { snap: ResidentSnapshot; now: Date; fmt: Fmt }) {
  const { state } = snap;
  const esc = snap.escalation;
  const actions = esc?.actions ?? [];
  const doneBy = (stepId: string) => actions.filter((a) => a.stepId === stepId);
  const otherActions = actions.filter((a) => !a.stepId);
  const noResponses = (esc?.contactsSinceDue ?? []).filter((c) => c.outcome === "no_response");

  const dialogSteps: DialogStep[] = state.steps.map((s) => ({
    id: s.id,
    label: ACTION_LABEL[s.action],
    instruction: s.instruction,
    timing: s.reached ? `since ${fmt.time(s.at)}` : `from ${fmt.time(s.at)}`,
    reached: s.reached,
    done: doneBy(s.id).length > 0,
  }));

  const timeline = [
    ...noResponses.map((c) => ({
      at: c.happenedAt,
      text: `No response (${METHOD_LABEL[c.method].toLowerCase()})${c.note ? ` — ${c.note}` : ""}`,
      who: c.staffName,
    })),
    ...otherActions.map((a) => ({ at: a.happenedAt, text: a.note ?? "Other action", who: a.staffName })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p>
          <span className="font-medium">
            {state.dueFromAbsence
              ? `Not back from planned absence — expected ${fmt.when(state.dueAt!, now)}`
              : `Overdue since ${fmt.when(state.dueAt!, now)}`}
          </span>
          <span className="text-muted-foreground"> · {durationBetween(state.dueAt!, now)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {esc
            ? `Escalation opened ${fmt.when(esc.openedAt, now)}${esc.openedByName ? ` by ${esc.openedByName}` : ""}${esc.version ? ` · rules v${esc.version.version}` : ""}`
            : "Escalation starts when you record a step or a no response"}
        </p>
      </div>

      <ol className="space-y-2">
        {state.steps.map((s, i) => {
          const done = doneBy(s.id);
          const isCurrent = i === state.currentStepIndex;
          const Icon = done.length > 0 ? CheckCircle2 : s.reached ? CircleAlert : Circle;
          return (
            <li
              key={s.id}
              className={cn(
                "flex gap-3 rounded-md p-2",
                isCurrent && done.length === 0 ? "bg-destructive/8 ring-1 ring-destructive/30" : "",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  done.length > 0
                    ? "text-success"
                    : s.reached
                      ? "text-destructive"
                      : "text-muted-foreground/60",
                )}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cn("font-medium", !s.reached && "text-muted-foreground")}>
                    {ACTION_LABEL[s.action]}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" aria-hidden />
                    {s.reached
                      ? `since ${fmt.time(s.at)}`
                      : `from ${fmt.time(s.at)} · in ${durationBetween(now, s.at)}`}
                  </span>
                </p>
                <p className={cn("mt-0.5", s.reached ? "" : "text-muted-foreground")}>{s.instruction}</p>
                {done.map((a) => (
                  <p key={a.id} className="mt-1 text-xs text-success">
                    Done {fmt.when(a.happenedAt, now)}
                    {a.staffName ? ` · ${a.staffName}` : ""}
                    {a.note ? <span className="text-muted-foreground"> — {a.note}</span> : null}
                  </p>
                ))}
                {s.reached && done.length === 0 ? (
                  <p className="mt-1 text-xs font-medium text-destructive">Not recorded yet</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {timeline.length > 0 ? (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Also logged</p>
          <ul className="space-y-0.5 text-xs">
            {timeline.map((e, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{fmt.when(e.at, now)}</span> {e.text}
                {e.who ? <span className="text-muted-foreground"> · {e.who}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <EscalationActionDialog
          residentId={snap.resident.id}
          residentName={snap.name}
          steps={dialogSteps}
          basis={snap.lastReset?.id ?? "none"}
        />
        <LogCheckDialog
          residentId={snap.resident.id}
          residentName={snap.name}
          triggerLabel="Found them — log seen"
          variant="outline"
        />
        <LogCheckDialog
          residentId={snap.resident.id}
          residentName={snap.name}
          defaultOutcome="no_response"
          triggerLabel="Log no response"
          variant="outline"
        />
      </div>
    </div>
  );
}
