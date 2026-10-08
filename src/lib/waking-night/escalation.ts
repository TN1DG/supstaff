/**
 * Escalation rules: when night staff log an event, which follow-up tasks it
 * creates. Pure and client-safe — the event dialog previews the same list the
 * server creates. Follow-ups show on the checklist and the night handover,
 * and every open one blocks sign-off.
 */

export const NIGHT_EVENT_TYPES = [
  "emergency_repair",
  "accident_incident",
  "anti_social_behaviour",
  "serious_incident",
  "customer_unwell",
  "staff_threatened",
] as const;
export type NightEventType = (typeof NIGHT_EVENT_TYPES)[number];

export const NIGHT_EVENT_SEVERITIES = ["minor_managed", "serious"] as const;
export type NightEventSeverity = (typeof NIGHT_EVENT_SEVERITIES)[number];

export const NIGHT_EVENT_META: Record<NightEventType, { label: string; hint: string }> = {
  emergency_repair: {
    label: "Emergency repair",
    hint: "A building fault that can't wait until morning.",
  },
  accident_incident: {
    label: "Accident or incident",
    hint: "With or without police attending.",
  },
  anti_social_behaviour: {
    label: "Anti-social behaviour",
    hint: "Staff–customer or customer–customer.",
  },
  serious_incident: {
    label: "Serious incident",
    hint: "Death, serious staff or customer injury, flood, serious fire.",
  },
  customer_unwell: {
    label: "Customer unwell",
    hint: "Or you're concerned about a customer's wellbeing.",
  },
  staff_threatened: {
    label: "Staff threatened",
    hint: "Or a customer is being intimidating or threatening.",
  },
};

/** How a follow-up gets done. `auto` ones are completed by the system when the event is logged. */
export type FollowUpSpec = {
  kind: string;
  label: string;
  allowNa: boolean;
  /** Pick one when marking it done, e.g. which number was called. */
  choices?: string[];
  /** Done by the system at log time — the record that does it is linked. */
  auto?: "repairs_log" | "written_handover";
  /** Uses a quick-reference number from service settings. */
  dial?: "ooh_repairs" | "on_call_manager" | "emergency" | "nhs" | "police_non_emergency";
};

const EMAIL_TEAM: FollowUpSpec = {
  kind: "email_team",
  label: "Email the team",
  allowNa: false,
};

/** Which follow-ups an event needs. */
export function followUpsFor(event: {
  type: NightEventType;
  severity: NightEventSeverity;
}): FollowUpSpec[] {
  const out: FollowUpSpec[] = [];
  switch (event.type) {
    case "emergency_repair":
      out.push(
        {
          kind: "call_ooh_repairs",
          label: "Call the out-of-hours repairs number",
          allowNa: false,
          dial: "ooh_repairs",
        },
        {
          kind: "update_repairs_log",
          label: "Update the repairs log",
          allowNa: false,
          auto: "repairs_log",
        },
        EMAIL_TEAM,
      );
      break;
    case "accident_incident":
      out.push(
        { kind: "sawit_incident_form", label: "Complete the SAW-IT incident form", allowNa: false },
        EMAIL_TEAM,
      );
      break;
    case "anti_social_behaviour":
      out.push(
        { kind: "record_inform", label: "Record it on In-Form", allowNa: false },
        { kind: "verbal_handover", label: "Give a verbal handover to day staff", allowNa: false },
        {
          kind: "written_handover",
          label: "Give a written handover to day staff",
          allowNa: false,
          auto: "written_handover",
        },
        {
          kind: "contact_emergency_services",
          label: "Contact police or emergency services if needed",
          allowNa: true,
          dial: "emergency",
        },
      );
      break;
    case "serious_incident":
      break; // the on-call follow-up below covers it
    case "customer_unwell":
      out.push({
        kind: "call_999_or_111",
        label: "Call 999 or 111",
        allowNa: false,
        choices: ["999", "111"],
        dial: "nhs",
      });
      break;
    case "staff_threatened":
      out.push({
        kind: "call_999_or_101",
        label: "Call 999 or 101",
        allowNa: false,
        choices: ["999", "101"],
        dial: "police_non_emergency",
      });
      break;
  }

  // A serious incident always goes to the on-call manager; anything else only
  // when it's serious — never for a minor incident that's already managed.
  if (event.type === "serious_incident" || event.severity === "serious") {
    out.push({
      kind: "contact_on_call_manager",
      label: "Contact the on-call manager",
      allowNa: false,
      dial: "on_call_manager",
    });
  }
  return out;
}
