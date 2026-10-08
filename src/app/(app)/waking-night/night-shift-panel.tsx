import Link from "next/link";
import { loadShiftView } from "@/lib/waking-night/shift-view";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The waking-night checklist as the AM staff see it on the night handover:
 * where the shift stands, and anything not done (with its reason).
 */
export async function NightShiftPanel({ siteId, night }: { siteId: string; night: string }) {
  const view = await loadShiftView(siteId, { night });
  if (!view.shift) return null;

  const signedOff = view.shift.status === "signed_off";
  const notDone = view.items.filter((i) => i.status === "not_done");
  const unresolved = view.items.filter((i) => !i.status);
  const roundIssues = view.rounds.filter((r) => r.timeliness === "late" || r.timeliness === "missed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Waking night checklist
          <StatusBadge tone={signedOff ? "success" : "info"}>
            {signedOff ? "Signed off" : "In progress"}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {view.items.length - unresolved.length} of {view.items.length} items resolved
          {signedOff && view.shift.signedOffBy ? ` · signed off by ${view.shift.signedOffBy.name}` : ""}
        </p>
        {roundIssues.length > 0 ? (
          <ul className="space-y-1">
            {roundIssues.map((r) => (
              <li key={r.roundTime}>
                <span className="font-medium">
                  {r.roundTime} round {r.timeliness}
                </span>
                {r.row?.timelinessReason ? ` — ${r.row.timelinessReason}` : " — no reason yet"}
              </li>
            ))}
          </ul>
        ) : null}
        {view.events.length > 0 ? (
          <div className="space-y-1">
            <p className="font-medium">Events &amp; follow-ups</p>
            <ul className="space-y-1">
              {view.events.map((e) => {
                const open = e.followUps.filter((f) => f.status === "open");
                const notDoneFu = e.followUps.filter((f) => f.status === "not_done");
                return (
                  <li key={e.id}>
                    {e.label}
                    {e.severity === "serious" ? " (serious)" : ""}
                    {open.length > 0 ? (
                      <span className="text-warning"> — to do: {open.map((f) => f.label).join(", ")}</span>
                    ) : notDoneFu.length > 0 ? (
                      <span className="text-warning">
                        {" "}
                        — not done: {notDoneFu.map((f) => `${f.label}${f.reason ? ` (${f.reason})` : ""}`).join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground"> — all follow-ups done</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {notDone.length > 0 ? (
          <ul className="space-y-1">
            {notDone.map((i) => (
              <li key={i.key}>
                <span className="font-medium">Not done: {i.label}</span>
                {i.reason ? ` — ${i.reason}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/waking-night" className="text-primary underline">
          Open the waking night
        </Link>
      </CardContent>
    </Card>
  );
}
