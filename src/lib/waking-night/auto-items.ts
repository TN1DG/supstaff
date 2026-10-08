import type { AutoOutcome, Evidence } from "@/lib/waking-night/checklist";
import type { RoundTimeliness } from "@/lib/waking-night/rounds";

/**
 * Decide each auto checklist item from a snapshot of the other modules' data.
 * Pure — `snapshot.ts` does the querying — so every rule is unit-tested. An
 * outcome with `met: false` tells staff why, and they complete it by hand.
 */

export type ShiftSnapshot = {
  /** Staff who worked tonight: who started the shift, did rounds, resolved items. */
  nightStaffIds: string[];
  lateHandover: {
    id: string;
    status: "draft" | "submitted" | "locked";
    acknowledgements: { staffId: string; staffName: string; readAtLabel: string }[];
  } | null;
  nightHandover: {
    id: string;
    status: "draft" | "submitted" | "locked";
    submittedAtLabel: string | null;
    submittedByName: string | null;
    /** The Salesforce outbox row queued on submit, if any. */
    salesforceStatus: "pending" | "processing" | "sent" | "failed" | null;
  } | null;
  eveningMeds: {
    rounds: string[];
    doses: {
      residentName: string;
      medicationName: string;
      roundLabel: string;
      outcome: string | null;
      /** No record and the round's window has closed. */
      missed: boolean;
    }[];
  };
  rounds: {
    roundTime: string;
    timeliness: RoundTimeliness | null;
    reasonMissing: boolean;
  }[];
  /** Tonight's logged events (Phase C); `onHandover` once written to the night handover. */
  events: { id: string; label: string; onHandover: boolean }[];
  /** Every "email the team" follow-up from tonight's events. */
  emailFollowUps: { id: string; label: string; status: "open" | "done" | "not_done" | "na" }[];
};

const ISSUE_OUTCOMES: Record<string, string> = {
  refused: "Refused",
  omitted: "Omitted",
  not_available: "Not available",
};

function handoverLink(id: string, label: string): Evidence {
  return { label, href: `/handovers/${id}` };
}

export function autoOutcomes(s: ShiftSnapshot): Record<string, AutoOutcome> {
  return {
    handover_received_pm: handoverReceived(s),
    handover_delivered_am: handoverDelivered(s),
    evening_meds_mar: eveningMeds(s),
    hs_building_checks: buildingChecks(s),
    shift_planner_inform: shiftPlanner(s),
    incidents_handed_over: incidentsHandedOver(s),
    incidents_emailed: incidentsEmailed(s),
  };
}

function handoverReceived({ lateHandover, nightStaffIds }: ShiftSnapshot): AutoOutcome {
  if (!lateHandover) return { met: false, evidence: [{ label: "No late-shift handover for tonight" }] };
  if (lateHandover.status === "draft") {
    return {
      met: false,
      evidence: [handoverLink(lateHandover.id, "Late-shift handover not submitted yet")],
    };
  }
  const ack = lateHandover.acknowledgements.find((a) => nightStaffIds.includes(a.staffId));
  if (!ack) {
    return {
      met: false,
      evidence: [handoverLink(lateHandover.id, "Late-shift handover not yet marked as read by night staff")],
    };
  }
  return {
    met: true,
    evidence: [handoverLink(lateHandover.id, `Read by ${ack.staffName} at ${ack.readAtLabel}`)],
    sourceEntityType: "handover",
    sourceEntityId: lateHandover.id,
  };
}

function handoverDelivered({ nightHandover }: ShiftSnapshot): AutoOutcome {
  if (!nightHandover) return { met: false, evidence: [{ label: "No night handover started" }] };
  if (nightHandover.status === "draft") {
    return { met: false, evidence: [handoverLink(nightHandover.id, "Night handover not submitted yet")] };
  }
  return {
    met: true,
    evidence: [
      handoverLink(
        nightHandover.id,
        `Submitted${nightHandover.submittedByName ? ` by ${nightHandover.submittedByName}` : ""}${
          nightHandover.submittedAtLabel ? ` at ${nightHandover.submittedAtLabel}` : ""
        }`,
      ),
    ],
    sourceEntityType: "handover",
    sourceEntityId: nightHandover.id,
  };
}

function eveningMeds({ eveningMeds: m }: ShiftSnapshot): AutoOutcome {
  const issues = m.doses
    .filter((d) => d.missed || (d.outcome && ISSUE_OUTCOMES[d.outcome]))
    .map(
      (d) =>
        `${d.missed ? "Missed" : ISSUE_OUTCOMES[d.outcome!]}: ${d.medicationName} for ${d.residentName} (${d.roundLabel})`,
    );
  if (m.doses.length === 0) {
    return { met: true, evidence: [{ label: "No evening doses scheduled", href: "/medication" }] };
  }
  const missed = m.doses.filter((d) => d.missed).length;
  const unrecorded = m.doses.filter((d) => !d.outcome && !d.missed).length;
  if (missed > 0 || unrecorded > 0) {
    const parts = [
      unrecorded ? `${unrecorded} dose${unrecorded === 1 ? "" : "s"} still to record` : null,
      missed ? `${missed} missed` : null,
    ].filter(Boolean);
    return { met: false, evidence: [{ label: parts.join(", "), href: "/medication" }], issues };
  }
  return {
    met: true,
    evidence: [{ label: `All ${m.doses.length} doses recorded — ${m.rounds.join(", ")}`, href: "/medication" }],
    issues,
  };
}

function buildingChecks({ rounds }: ShiftSnapshot): AutoOutcome {
  if (rounds.length === 0) return { met: false, evidence: [{ label: "No rounds scheduled" }] };
  const open = rounds.filter((r) => !r.timeliness);
  const noReason = rounds.filter((r) => r.reasonMissing);
  const count = (t: RoundTimeliness) => rounds.filter((r) => r.timeliness === t).length;
  const summary = `${count("on_time")} on time, ${count("late")} late, ${count("missed")} missed`;
  if (open.length > 0 || noReason.length > 0) {
    const why = open.length
      ? `${open.length} round${open.length === 1 ? "" : "s"} not finished`
      : `${noReason.length} late/missed round${noReason.length === 1 ? "" : "s"} without a reason`;
    return { met: false, evidence: [{ label: `${why} (${summary})`, href: "/night-checks" }] };
  }
  return {
    met: true,
    evidence: [{ label: `All ${rounds.length} rounds logged — ${summary}`, href: "/night-checks" }],
  };
}

function shiftPlanner({ nightHandover }: ShiftSnapshot): AutoOutcome {
  if (!nightHandover || nightHandover.status === "draft") {
    return { met: false, evidence: [{ label: "Night handover not submitted, so nothing sent to In-Form" }] };
  }
  if (nightHandover.salesforceStatus === "sent") {
    return {
      met: true,
      evidence: [handoverLink(nightHandover.id, "Night handover synced to Salesforce")],
      sourceEntityType: "handover",
      sourceEntityId: nightHandover.id,
    };
  }
  const label =
    nightHandover.salesforceStatus === "failed"
      ? "Salesforce sync failed"
      : nightHandover.salesforceStatus
        ? "Queued for Salesforce — sync not confirmed yet"
        : "Not queued for Salesforce";
  return { met: false, evidence: [handoverLink(nightHandover.id, label)] };
}

function incidentsHandedOver({ nightHandover, events }: ShiftSnapshot): AutoOutcome {
  if (!nightHandover || nightHandover.status === "draft") {
    return { met: false, evidence: [{ label: "Night handover not submitted yet" }] };
  }
  const missing = events.filter((e) => !e.onHandover);
  if (missing.length > 0) {
    return {
      met: false,
      evidence: missing.map((e) => ({ label: `Not on the handover: ${e.label}` })),
    };
  }
  return {
    met: true,
    evidence: [
      handoverLink(
        nightHandover.id,
        events.length === 0
          ? "No incidents logged tonight — handover submitted"
          : `${events.length} event${events.length === 1 ? "" : "s"} on the submitted handover`,
      ),
    ],
    sourceEntityType: "handover",
    sourceEntityId: nightHandover.id,
  };
}

function incidentsEmailed({ events, emailFollowUps }: ShiftSnapshot): AutoOutcome {
  if (events.length === 0) return { met: true, evidence: [{ label: "No incidents to email tonight" }] };
  const notDone = emailFollowUps.filter((f) => f.status !== "done");
  if (notDone.length > 0) {
    return {
      met: false,
      evidence: notDone.map((f) => ({ label: `Not confirmed: ${f.label}` })),
    };
  }
  return {
    met: true,
    evidence: [{ label: `${emailFollowUps.length} team email${emailFollowUps.length === 1 ? "" : "s"} confirmed` }],
  };
}
