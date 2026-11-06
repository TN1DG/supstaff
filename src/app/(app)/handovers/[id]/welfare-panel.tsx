import Link from "next/link";
import type { ShiftType } from "@/db/schema";
import { needsAction } from "@/lib/welfare-engine";
import { loadWelfareFacts, siteTimeZone } from "@/lib/welfare-queries";
import { residentName, snapshotAt } from "@/lib/welfare-snapshot";
import { ACTION_LABEL } from "@/lib/welfare-policy";
import { OUTCOME_LABEL, WELFARE_STATUS_META, shiftWindow, welfareFormatters } from "@/lib/welfare";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What happened with welfare checks during this handover's shift, worked
 * out from the welfare records — nothing is copied into the handover, so
 * it can't drift from the board.
 */
export async function WelfarePanel({
  siteId,
  handoverDate,
  shift,
}: {
  siteId: string;
  handoverDate: string;
  shift: ShiftType;
}) {
  const now = new Date();
  const timeZone = await siteTimeZone(siteId);
  const { start, end } = shiftWindow(handoverDate, shift, timeZone);
  if (start.getTime() > now.getTime()) return null;

  const ongoing = now.getTime() < end.getTime();
  const asOf = ongoing ? now : end;
  const fmt = welfareFormatters(timeZone);
  const facts = await loadWelfareFacts(siteId, start);
  const name = new Map(facts.residents.map((r) => [r.id, residentName(r)]));
  const inShift = (d: Date | null) => !!d && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  const at = (d: Date) => fmt.when(d, asOf);

  const snaps = snapshotAt(facts, asOf);
  const outstanding = snaps.filter((s) => needsAction(s.state));
  const noPlan = snaps.filter((s) => s.state.kind === "no_plan").length;

  const escalations = facts.escalations
    .filter(
      (e) =>
        e.openedAt.getTime() < end.getTime() &&
        (!e.resolvedAt || e.resolvedAt.getTime() >= start.getTime()),
    )
    .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  // Late sightings only — a late "no response" already shows under its escalation.
  const late = facts.contacts.filter(
    (c) =>
      c.outcome !== "no_response" &&
      inShift(c.happenedAt) &&
      c.overdueMinutes !== null &&
      c.overdueMinutes > 0,
  );
  const absences = facts.absences.filter(
    (a) => !a.cancelledAt && (inShift(a.startsAt) || inShift(a.endedAt) || inShift(a.expectedBackAt)),
  );

  const quiet = outstanding.length === 0 && escalations.length === 0 && late.length === 0 && absences.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Welfare this shift</CardTitle>
        <p className="text-xs text-muted-foreground">
          {fmt.time(start)}–{fmt.time(end)}
          {ongoing ? " · so far" : ""} ·{" "}
          <Link href="/welfare" className="underline">
            Welfare board
          </Link>
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {quiet ? (
          <p className="text-muted-foreground">
            No overdue checks, escalations or planned absences{ongoing ? " so far" : ""}.
          </p>
        ) : null}

        {outstanding.length > 0 ? (
          <Section title={ongoing ? "Needing action now" : "Still needing action at end of shift"}>
            {outstanding.map((s) => (
              <li key={s.resident.id} className="space-y-0.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <StatusBadge tone={WELFARE_STATUS_META[s.state.kind].tone}>
                    {WELFARE_STATUS_META[s.state.kind].label}
                  </StatusBadge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Due {at(s.state.dueAt!)}
                  {s.state.currentStepIndex !== null
                    ? ` · at step: ${ACTION_LABEL[s.state.steps[s.state.currentStepIndex].action].toLowerCase()}`
                    : ""}
                </p>
              </li>
            ))}
          </Section>
        ) : null}

        {escalations.length > 0 ? (
          <Section title="Escalations">
            {escalations.map((e) => {
              const acts = facts.actions.filter((a) => a.escalationId === e.id && inShift(a.happenedAt));
              const resolvedInShift = e.resolvedAt && e.resolvedAt.getTime() < end.getTime();
              return (
                <li key={e.id} className="space-y-0.5">
                  <p className="font-medium">{name.get(e.residentId) ?? "Resident"}</p>
                  <p className="text-xs text-muted-foreground">
                    Overdue from {at(e.dueAt)} · opened {at(e.openedAt)}
                    {e.openedByName ? ` by ${e.openedByName}` : ""}
                  </p>
                  {acts.map((a) => (
                    <p key={a.id} className="text-xs">
                      {at(a.happenedAt)} {ACTION_LABEL[a.action]}
                      {a.note ? ` — ${a.note}` : ""}
                      {a.staffName ? <span className="text-muted-foreground"> · {a.staffName}</span> : null}
                    </p>
                  ))}
                  <p className="text-xs">
                    {resolvedInShift ? (
                      <span className="text-success">
                        Closed {at(e.resolvedAt!)}
                        {e.resolvedByName ? ` · ${e.resolvedByName}` : ""} — seen or contacted
                      </span>
                    ) : (
                      <span className="font-medium text-destructive">
                        {ongoing ? "Still open" : "Still open at end of shift"}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </Section>
        ) : null}

        {late.length > 0 ? (
          <Section title="Checked late">
            {late.map((c) => (
              <li key={c.id} className="text-xs">
                <span className="font-medium">{name.get(c.residentId) ?? "Resident"}</span>{" "}
                {OUTCOME_LABEL[c.outcome].toLowerCase()} {at(c.happenedAt)} · {c.overdueMinutes} min late
                {c.staffName ? <span className="text-muted-foreground"> · {c.staffName}</span> : null}
              </li>
            ))}
          </Section>
        ) : null}

        {absences.length > 0 ? (
          <Section title="Planned absences">
            {absences.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-medium">{name.get(a.residentId) ?? "Resident"}</span>{" "}
                {inShift(a.startsAt) ? `left ${at(a.startsAt)}` : `away since ${at(a.startsAt)}`}
                {a.endedAt && a.endedAt.getTime() <= asOf.getTime()
                  ? ` · back ${at(a.endedAt)}`
                  : ` · due back ${at(a.expectedBackAt)}`}
                {a.reason ? <span className="text-muted-foreground"> · {a.reason}</span> : null}
              </li>
            ))}
          </Section>
        ) : null}

        {noPlan > 0 ? (
          <p className="text-xs text-muted-foreground">
            {noPlan} resident{noPlan === 1 ? " has" : "s have"} no welfare plan.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}
