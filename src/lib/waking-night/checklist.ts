import type { ChecklistResultStatusValue } from "@/db/schema";

/**
 * The waking-night checklist, replacing the paper sheet staff initialled.
 * Definitions live in code (same posture as MEDICATION_ROUNDS); how each item
 * was resolved on a given night lives in `shift_checklist_results`.
 *
 * Client-safe: no server imports, so dialogs can share the rules.
 */

export type ChecklistItemDef = {
  key: string;
  label: string;
  /** `auto` items tick themselves from other modules' data (Phase B). */
  kind: "auto" | "manual";
  allowNa: boolean;
  /** Where an auto item gets its answer — shown under the label. */
  source?: string;
};

export const CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  {
    key: "handover_received_pm",
    label: "Handover received from PM staff",
    kind: "auto",
    allowNa: false,
    source: "Handovers — late shift handover acknowledged",
  },
  {
    key: "lone_worker_factsheet",
    label: "Lone Worker fact sheet read and followed",
    kind: "manual",
    allowNa: false,
  },
  {
    key: "evening_meds_mar",
    label: "Evening medication supervised and MAR charts completed",
    kind: "auto",
    allowNa: false,
    source: "Medication — evening round fully recorded",
  },
  {
    key: "hs_building_checks",
    label: "H&S building checks done (all welfare rounds logged)",
    kind: "auto",
    allowNa: false,
    source: "Night checks — every round logged, reasons given",
  },
  { key: "cctv_checks", label: "CCTV checks made", kind: "manual", allowNa: false },
  {
    key: "cctv_info_recorded",
    label: "CCTV information added to handover and In-Form notes",
    kind: "manual",
    allowNa: true,
  },
  {
    key: "office_cleaned",
    label: "Office cleaned — desks, toilet, floor, fridge; toilet roll and hand soap restocked",
    kind: "manual",
    allowNa: false,
  },
  { key: "bins_out", label: "Bins taken out", kind: "manual", allowNa: false },
  {
    key: "incidents_handed_over",
    label: "Issues/incidents handed over to day staff",
    kind: "auto",
    allowNa: false,
    source: "Handovers — night handover submitted with tonight's events",
  },
  {
    key: "incidents_emailed",
    label: "Issues/incidents emailed to the team",
    kind: "auto",
    allowNa: false,
    source: "Follow-ups — every 'email the team' done",
  },
  {
    key: "shift_planner_inform",
    label: "Shift Planner notes updated and uploaded to In-Form",
    kind: "auto",
    allowNa: false,
    source: "Salesforce sync of the night handover",
  },
  {
    key: "handover_delivered_am",
    label: "Handover prepared and delivered to AM staff",
    kind: "auto",
    allowNa: false,
    source: "Handovers — night handover submitted",
  },
];

export const CHECKLIST_ITEM_BY_KEY = new Map(CHECKLIST_ITEMS.map((i) => [i.key, i]));

export type Evidence = { label: string; href?: string };

/** What an auto item's source data says. `met: false` means "complete it by hand". */
export type AutoOutcome = {
  met: boolean;
  /** The record(s) that completed it, or why it couldn't be. */
  evidence: Evidence[];
  sourceEntityType?: string;
  sourceEntityId?: string;
  /** Problems to surface even when met, e.g. refused doses. */
  issues?: string[];
};

export type ManualResult = {
  itemKey: string;
  status: ChecklistResultStatusValue;
  reason: string | null;
  /** `auto` only for the snapshot written at sign-off. */
  source?: "auto" | "manual";
  resolvedByName?: string | null;
  resolvedAt?: Date | null;
};

export type ResolvedItem = ChecklistItemDef & {
  status: ChecklistResultStatusValue | null;
  resolvedBy: "auto" | "manual" | null;
  reason: string | null;
  evidence: Evidence[];
  issues: string[];
  resolvedByName: string | null;
  resolvedAt: Date | null;
};

/**
 * Merge the live auto outcomes with what staff have recorded by hand. An auto
 * item whose data is there is done regardless of any manual row; otherwise
 * the manual row (if any) stands.
 */
export function evaluateChecklist(
  manual: ManualResult[],
  auto: Partial<Record<string, AutoOutcome>> = {},
): ResolvedItem[] {
  const manualByKey = new Map(manual.map((m) => [m.itemKey, m]));
  return CHECKLIST_ITEMS.map((def) => {
    const outcome = def.kind === "auto" ? auto[def.key] : undefined;
    const m = manualByKey.get(def.key);
    const base = {
      ...def,
      evidence: outcome?.evidence ?? [],
      issues: outcome?.issues ?? [],
    };
    if (outcome?.met) {
      return {
        ...base,
        status: "done" as const,
        resolvedBy: "auto" as const,
        reason: null,
        resolvedByName: null,
        resolvedAt: null,
      };
    }
    if (m) {
      return {
        ...base,
        status: m.status,
        resolvedBy: m.source ?? ("manual" as const),
        reason: m.reason,
        resolvedByName: m.resolvedByName ?? null,
        resolvedAt: m.resolvedAt ?? null,
      };
    }
    return {
      ...base,
      status: null,
      resolvedBy: null,
      reason: null,
      resolvedByName: null,
      resolvedAt: null,
    };
  });
}

/**
 * The rule for a staff-entered resolution. Returns an error message, or null
 * when it's acceptable.
 * - not done always needs a reason;
 * - N/A only where the item allows it;
 * - ticking an *auto* item by hand needs a reason (its source data is missing).
 */
export function validateResolution(
  def: ChecklistItemDef,
  status: ChecklistResultStatusValue,
  reason: string | null | undefined,
): string | null {
  const hasReason = !!reason?.trim();
  if (status === "na" && !def.allowNa) return "This item can't be marked N/A.";
  if (status === "not_done" && !hasReason) return "Say why it wasn't done.";
  if (status === "done" && def.kind === "auto" && !hasReason) {
    return "This item normally ticks itself — say why you're completing it by hand.";
  }
  return null;
}
