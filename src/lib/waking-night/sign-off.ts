import type { ResolvedItem } from "@/lib/waking-night/checklist";
import type { LiveRoundState, RoundTimeliness } from "@/lib/waking-night/rounds";

/**
 * Everything standing between a shift and sign-off, as staff-readable lines.
 * Empty means the shift can be signed off. Pure, so the page (to show the
 * list) and `signOffShift` (to enforce it) agree exactly.
 */

type RoundLike = {
  roundTime: string;
  state: LiveRoundState;
  timeliness: RoundTimeliness | null;
  reasonMissing: boolean;
};

export type FollowUpLike = {
  label: string;
  status: "open" | "done" | "not_done" | "na";
};

const OPEN_ROUND_STATES: LiveRoundState[] = ["scheduled", "due", "overdue", "in_progress"];

export function signOffBlockers(input: {
  items: ResolvedItem[];
  rounds: RoundLike[];
  followUps?: FollowUpLike[];
}): string[] {
  const out: string[] = [];

  for (const r of input.rounds) {
    if (OPEN_ROUND_STATES.includes(r.state)) {
      out.push(`The ${r.roundTime} round isn't finished yet.`);
    } else if (r.reasonMissing) {
      out.push(`The ${r.roundTime} round was ${r.timeliness === "late" ? "late" : "missed"} — add a reason.`);
    }
  }

  for (const item of input.items) {
    if (!item.status) out.push(`“${item.label}” isn't resolved.`);
  }

  for (const f of input.followUps ?? []) {
    if (f.status === "open") out.push(`Follow-up “${f.label}” is still open.`);
  }

  return out;
}
