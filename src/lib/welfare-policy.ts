import { z } from "zod";

/*
 * Welfare rules — the shape of a service's published rules, the
 * organisation guardrails every publish is checked against, and the plain
 * language staff and managers read. Client-safe (no server imports): the
 * rules editor validates and previews with exactly the functions the
 * publish action uses.
 */

export const ESCALATION_ACTIONS = [
  "retry_contact",
  "inform_on_call",
  "inform_manager",
  "report_missing",
  "other",
] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];

/**
 * How a tier's step times are written. Both describe the same moment — a
 * step is always timed from when the check falls due — but services copy
 * timings from a Missing Persons Procedure written one way or the other:
 * "6 hours since last seen" (last_seen) or "2 hours overdue" (due).
 */
export const CLOCK_STARTS = ["last_seen", "due"] as const;
export type ClockStart = (typeof CLOCK_STARTS)[number];

export type PolicyStep = {
  id: string;
  /** Minutes after the tier's clock start (see ClockStart). */
  afterMinutes: number;
  action: EscalationAction;
  /** What staff see on the escalation checklist. */
  instruction: string;
};

export type PolicyTier = {
  /** Stable across versions — resident plans point at it. */
  key: string;
  name: string;
  /** The longest a resident on this tier may go without being seen or contacted. */
  intervalMinutes: number;
  clockStart: ClockStart;
  steps: PolicyStep[];
};

export type WelfarePolicyConfig = { tiers: PolicyTier[] };

/**
 * Organisation guardrails. Set centrally and changed by a deploy, never in
 * the app; every service's rules must sit inside them.
 *
 * PLACEHOLDER VALUES — to be replaced with the timescales in the
 * organisation's Missing Persons Procedure once confirmed (spec §9).
 */
export const ORG_GUARDRAILS = {
  minIntervalMinutes: 30,
  maxIntervalMinutes: 24 * 60,
  /** Every tier must prompt staff to inform on-call within this long of a check becoming overdue. */
  onCallWithinMinutesOfOverdue: 4 * 60,
  /** …and to report missing within this long. */
  reportMissingWithinMinutesOfOverdue: 12 * 60,
  maxStepsPerTier: 6,
  maxTiers: 5,
  /** How far back staff may log a check or action that already happened. */
  lateLogWindowMinutes: 6 * 60,
  /** A check due within this long shows as "Due soon". */
  dueSoonMinutes: 60,
  /** The welfare board shows a "rules changed" banner for this long after a publish. */
  ruleChangeBannerDays: 7,
  /** Warn the rules owner this long before the review date. */
  rulesReviewWarningDays: 14,
  /** Flag a resident plan not reviewed for this long. */
  planReviewMonths: 6,
} as const;

const stepSchema = z.object({
  id: z.string().min(1).max(40),
  afterMinutes: z.number().int().min(0).max(14 * 24 * 60),
  action: z.enum(ESCALATION_ACTIONS),
  instruction: z.string().trim().max(500),
});

const tierSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().trim().max(60),
  intervalMinutes: z.number().int().min(1).max(14 * 24 * 60),
  clockStart: z.enum(CLOCK_STARTS),
  steps: z.array(stepSchema).max(20),
});

/** Shape only — the guardrails are `validatePolicy`'s job. */
export const policyConfigSchema = z.object({ tiers: z.array(tierSchema).max(20) });

/** Parse stored or submitted JSON into a config, or null if it isn't one. */
export function parsePolicyConfig(value: unknown): WelfarePolicyConfig | null {
  const parsed = policyConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** When a step comes due, in minutes after the check itself was due. */
export function minutesAfterDue(tier: Pick<PolicyTier, "clockStart" | "intervalMinutes">, step: Pick<PolicyStep, "afterMinutes">): number {
  return tier.clockStart === "due" ? step.afterMinutes : step.afterMinutes - tier.intervalMinutes;
}

/** A tier's steps in the order they come due (ties keep the order they were written in). */
export function sortedSteps(tier: PolicyTier): PolicyStep[] {
  return tier.steps
    .map((step, i) => ({ step, i, at: minutesAfterDue(tier, step) }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.step);
}

export type PolicyIssue = {
  /** Which part of the rules — `tiers.1`, `tiers.1.steps.0`, or `rules`. */
  path: string;
  message: string;
};

/**
 * Check rules against the organisation guardrails. An empty list means they
 * can be published. `residentsOnTier` (tier key → how many residents' plans
 * use it) stops a tier being removed while residents are still on it.
 */
export function validatePolicy(
  config: WelfarePolicyConfig,
  residentsOnTier: Record<string, number> = {},
): PolicyIssue[] {
  const g = ORG_GUARDRAILS;
  const issues: PolicyIssue[] = [];

  if (config.tiers.length === 0) {
    issues.push({ path: "rules", message: "Add at least one risk tier." });
  }
  if (config.tiers.length > g.maxTiers) {
    issues.push({ path: "rules", message: `Use at most ${g.maxTiers} risk tiers.` });
  }

  const seenNames = new Map<string, number>();
  const seenKeys = new Set<string>();
  config.tiers.forEach((tier, ti) => {
    const at = `tiers.${ti}`;
    const name = tier.name.trim();
    const label = name || `Tier ${ti + 1}`;

    if (!name) issues.push({ path: at, message: `${label}: give the tier a name.` });
    const lower = name.toLowerCase();
    if (name && seenNames.has(lower)) {
      issues.push({ path: at, message: `${label}: another tier already has this name.` });
    }
    seenNames.set(lower, ti);
    if (seenKeys.has(tier.key)) {
      issues.push({ path: at, message: `${label}: duplicate tier key — remove and re-add this tier.` });
    }
    seenKeys.add(tier.key);

    if (tier.intervalMinutes < g.minIntervalMinutes) {
      issues.push({
        path: at,
        message: `${label}: checks can't be more often than every ${formatMinutes(g.minIntervalMinutes)}.`,
      });
    }
    if (tier.intervalMinutes > g.maxIntervalMinutes) {
      issues.push({
        path: at,
        message: `${label}: the organisation limit is a check at least every ${formatMinutes(g.maxIntervalMinutes)}.`,
      });
    }

    if (tier.steps.length === 0) {
      issues.push({ path: at, message: `${label}: add the escalation steps.` });
    }
    if (tier.steps.length > g.maxStepsPerTier) {
      issues.push({ path: at, message: `${label}: use at most ${g.maxStepsPerTier} steps.` });
    }

    tier.steps.forEach((step, si) => {
      const stepAt = `${at}.steps.${si}`;
      if (!step.instruction.trim()) {
        issues.push({
          path: stepAt,
          message: `${label}, step ${si + 1}: add the instruction staff will see.`,
        });
      }
      if (minutesAfterDue(tier, step) < 0) {
        issues.push({
          path: stepAt,
          message: `${label}, step ${si + 1}: it comes before the check is due (${formatMinutes(tier.intervalMinutes)} since last seen). Move it to ${formatMinutes(tier.intervalMinutes)} or later.`,
        });
      }
    });

    const firstOf = (action: EscalationAction) => {
      const times = tier.steps
        .filter((s) => s.action === action)
        .map((s) => minutesAfterDue(tier, s));
      return times.length ? Math.min(...times) : null;
    };

    const onCall = firstOf("inform_on_call");
    if (onCall === null) {
      issues.push({ path: at, message: `${label}: every tier needs an "Inform on-call" step.` });
    } else if (onCall > g.onCallWithinMinutesOfOverdue) {
      issues.push({
        path: at,
        message: `${label}: on-call must be informed within ${formatMinutes(g.onCallWithinMinutesOfOverdue)} of a check becoming overdue (this is ${formatMinutes(onCall)}).`,
      });
    }

    const missing = firstOf("report_missing");
    if (missing === null) {
      issues.push({ path: at, message: `${label}: every tier needs a "Report missing" step.` });
    } else if (missing > g.reportMissingWithinMinutesOfOverdue) {
      issues.push({
        path: at,
        message: `${label}: a missing person must be reported within ${formatMinutes(g.reportMissingWithinMinutesOfOverdue)} of a check becoming overdue (this is ${formatMinutes(missing)}).`,
      });
    }
  });

  for (const [key, count] of Object.entries(residentsOnTier)) {
    if (count > 0 && !config.tiers.some((t) => t.key === key)) {
      issues.push({
        path: "rules",
        message: `${count} resident${count === 1 ? " is" : "s are"} on a tier you've removed. Move ${count === 1 ? "them" : "them"} to another tier in their welfare plan first.`,
      });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* Plain language                                                       */
/* ------------------------------------------------------------------ */

export const ACTION_LABEL: Record<EscalationAction, string> = {
  retry_contact: "Try contact again",
  inform_on_call: "Inform on-call",
  inform_manager: "Inform manager",
  report_missing: "Report missing",
  other: "Other",
};

const ACTION_PHRASE: Record<EscalationAction, string> = {
  retry_contact: "try to contact them again",
  inform_on_call: "inform on-call",
  inform_manager: "inform the manager",
  report_missing: "report them missing under the Missing Persons Procedure",
  other: "follow the step's instruction",
};

export const CLOCK_START_LABEL: Record<ClockStart, string> = {
  last_seen: "Since last seen",
  due: "After the check is overdue",
};

/** "45 minutes", "3 hours", "1 hour 30 minutes". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = rest ? `${rest} minute${rest === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

/** Compact "3h", "1h 30m", "45m". */
export function formatMinutesShort(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h}h ${rest}m`;
  if (h) return `${h}h`;
  return `${rest}m`;
}

export function describeTier(tier: PolicyTier): string {
  return `Seen or contacted at least every ${formatMinutes(tier.intervalMinutes)}.`;
}

/**
 * One step as a sentence, e.g. "If someone on Higher risk hasn't been seen
 * or contacted for 5 hours, staff are prompted to inform on-call."
 */
export function describeStep(tier: PolicyTier, step: PolicyStep): string {
  const name = tier.name.trim() || "this tier";
  const after = minutesAfterDue(tier, step);
  const sinceSeen = tier.intervalMinutes + after;
  const prompt = `staff are prompted to ${ACTION_PHRASE[step.action]}`;
  if (tier.clockStart === "last_seen") {
    return `If someone on ${name} hasn't been seen or contacted for ${formatMinutes(sinceSeen)}, ${prompt}.`;
  }
  if (after === 0) {
    return `As soon as a check on ${name} is overdue (${formatMinutes(sinceSeen)} since last seen), ${prompt}.`;
  }
  return `If a check on ${name} is ${formatMinutes(after)} overdue (${formatMinutes(sinceSeen)} since last seen), ${prompt}.`;
}

/* ------------------------------------------------------------------ */
/* Organisation default — where a service with no rules starts           */
/* ------------------------------------------------------------------ */

/** Placeholder content, like the guardrails, until the organisation confirms it. */
export const DEFAULT_POLICY: WelfarePolicyConfig = {
  tiers: [
    {
      key: "standard",
      name: "Standard",
      intervalMinutes: 24 * 60,
      clockStart: "due",
      steps: [
        {
          id: "std-1",
          afterMinutes: 0,
          action: "retry_contact",
          instruction:
            "Knock on their door, call their mobile and check communal areas. Ask other residents if they've seen them.",
        },
        {
          id: "std-2",
          afterMinutes: 2 * 60,
          action: "inform_on_call",
          instruction:
            "Phone on-call. Say who it is, when they were last seen, and everything you've tried.",
        },
        {
          id: "std-3",
          afterMinutes: 8 * 60,
          action: "report_missing",
          instruction:
            "Follow the Missing Persons Procedure with on-call: report to the police and record the reference number.",
        },
      ],
    },
    {
      key: "higher",
      name: "Higher risk",
      intervalMinutes: 4 * 60,
      clockStart: "last_seen",
      steps: [
        {
          id: "hr-1",
          afterMinutes: 4 * 60,
          action: "retry_contact",
          instruction:
            "Knock and call their mobile straight away. Check their usual places nearby if it's safe to.",
        },
        {
          id: "hr-2",
          afterMinutes: 5 * 60,
          action: "inform_on_call",
          instruction:
            "Phone on-call. Give their description, what they were wearing, and when and where they were last seen.",
        },
        {
          id: "hr-3",
          afterMinutes: 8 * 60,
          action: "report_missing",
          instruction:
            "Follow the Missing Persons Procedure with on-call: report to the police and record the reference number.",
        },
      ],
    },
  ],
};

/** A short random id for a new tier or step. */
export function newPolicyId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
