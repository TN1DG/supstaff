import type { ResidentStatusValue } from "@/db/schema";
import type { StatusTone } from "@/lib/status-tone";

/**
 * The single source of truth for how a resident's status renders — color
 * tone + label. Previously `on_leave` and `discharged` rendered identically
 * (both a colorless outline badge); `on_leave` is `info` (away, not a
 * problem) and `discharged` is `neutral` (historical) so the three states
 * are all visually distinct.
 */
export const RESIDENT_STATUS_META: Record<ResidentStatusValue, { tone: StatusTone; label: string }> = {
  active: { tone: "success", label: "In the house" },
  on_leave: { tone: "info", label: "On leave" },
  discharged: { tone: "neutral", label: "Discharged" },
};

/**
 * Numeric room order (1, 2, 3 … 15), not string order (which would sort
 * "10" before "2"). Residents without a room number sort last. Use this
 * wherever a resident list should read the way staff walk the building —
 * handovers, in particular, are always written and read in room order.
 */
export function compareByRoom(a: { room: string | null }, b: { room: string | null }): number {
  const an = a.room ? Number.parseInt(a.room, 10) : null;
  const bn = b.room ? Number.parseInt(b.room, 10) : null;
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  if (Number.isNaN(an) || Number.isNaN(bn)) return (a.room ?? "").localeCompare(b.room ?? "");
  return an - bn;
}

/**
 * Risk flags are freeform text (no fixed vocabulary — see `residents.riskFlags`,
 * a plain `text[]` column), so there's no stored description to show. This is
 * a best-effort lookup for the common ones staff actually type, matched by
 * substring so small wording variations ("Fall risk" vs "Falls risk") still
 * hit; anything unrecognised falls back to a generic line rather than
 * showing nothing.
 */
const RISK_FLAG_DESCRIPTIONS: { match: string; description: string }[] = [
  { match: "fall", description: "Increased risk of falling — provide extra supervision and make sure mobility aids are used." },
  { match: "wander", description: "May wander or move around unexpectedly — check on them regularly and keep the environment safe." },
  { match: "diabet", description: "Living with diabetes — monitor blood sugar and diet as set out in their care plan." },
  { match: "chok", description: "Increased risk of choking — follow any modified diet or texture guidance and supervise meals." },
  { match: "pressure sore", description: "At risk of pressure sores — reposition regularly and check their skin." },
  { match: "dementia", description: "Living with dementia — use calm, clear communication and allow extra time." },
  { match: "abscond", description: "May try to leave the building unsupervised — keep an eye on exits." },
  { match: "leaves without notice", description: "May leave the building without telling staff — check their whereabouts regularly." },
  { match: "aggress", description: "May become agitated or aggressive — approach calmly and follow their care plan." },
  { match: "allerg", description: "Has a known allergy — check their care plan before giving food or medication." },
];
const RISK_FLAG_FALLBACK = "Flagged by the care team — check the resident's care plan for details.";

export function riskFlagDescription(flag: string): string {
  const lower = flag.toLowerCase();
  return RISK_FLAG_DESCRIPTIONS.find((d) => lower.includes(d.match))?.description ?? RISK_FLAG_FALLBACK;
}
