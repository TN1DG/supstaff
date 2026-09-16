import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getDb } from "@/db";
import { nightCheckRounds } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import { bySite } from "@/lib/db-scope";
import { CHECKLIST_ITEM_STATUS_META, ROUND_STATUS_META } from "@/lib/night-checks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { RoundChecklist } from "./round-checklist";
import { CompleteRoundDialog } from "./complete-dialog";
import { WelfareSection } from "./welfare-section";

export const metadata: Metadata = { title: "Night check round" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RoundPage({
  params,
}: PageProps<"/night-checks/[id]">) {
  const staffMember = await requireStaff();
  const { id } = await params;
  const db = getDb();

  const round = await db.query.nightCheckRounds.findFirst({
    where: bySite(nightCheckRounds, id, staffMember.siteId),
    with: {
      staff: { columns: { name: true } },
      completedBy: { columns: { name: true } },
      items: {
        with: {
          templateItem: {
            columns: { area: true, description: true, sortOrder: true, kind: true },
          },
        },
      },
    },
  });
  if (!round) notFound();

  const items = round.items
    .slice()
    .sort((a, b) => a.templateItem.sortOrder - b.templateItem.sortOrder)
    .map((i) => ({
      templateItemId: i.templateItemId,
      area: i.templateItem.area,
      description: i.templateItem.description,
      kind: i.templateItem.kind,
      status: i.status,
      note: i.note,
    }));

  const genericItems = items.filter((i) => i.kind !== "resident_welfare");
  const welfareItem = items.find((i) => i.kind === "resident_welfare");
  const attentionCount = items.filter((i) => i.status === "attention").length;

  return (
    <>
      <PageHeader
        title={`${round.roundTime} round`}
        description={`Night of ${dateFmt.format(new Date(`${round.checkDate}T00:00:00`))}`}
      >
        <StatusBadge tone={ROUND_STATUS_META[round.status].tone}>
          {ROUND_STATUS_META[round.status].label}
        </StatusBadge>
      </PageHeader>

      {round.status === "missed" ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            This round&rsquo;s window passed without anyone checking in — it
            was recorded as missed for the manager&rsquo;s compliance report.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Checked in by {round.staff?.name ?? "—"}
            {round.startedAt ? ` · ${timeFmt.format(round.startedAt)}` : ""}
            {round.status === "complete" && round.completedAt ? (
              <>
                {" "}
                · Completed by {round.completedBy?.name ?? "—"} ·{" "}
                {timeFmt.format(round.completedAt)}
              </>
            ) : null}
          </p>

          {round.status === "in_progress" ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <RoundChecklist roundId={round.id} items={genericItems} />
                </CardContent>
              </Card>
              {welfareItem ? (
                <Card>
                  <CardContent className="pt-6">
                    <WelfareSection
                      siteId={staffMember.siteId}
                      roundId={round.id}
                      templateItemId={welfareItem.templateItemId}
                      readOnly={false}
                    />
                  </CardContent>
                </Card>
              ) : null}
              <div className="flex items-center gap-3 rounded-xl border bg-background/90 p-3 text-sm">
                {attentionCount > 0 ? (
                  <p className="flex items-center gap-1.5 text-warning">
                    <AlertTriangle className="size-4" aria-hidden />
                    {attentionCount} item{attentionCount === 1 ? "" : "s"}{" "}
                    flagged for attention.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Save the checklist, then complete the round.
                  </p>
                )}
                <div className="ml-auto">
                  <CompleteRoundDialog roundId={round.id} />
                </div>
              </div>
            </>
          ) : (
            <>
              <Card>
                <CardContent className="divide-y pt-6">
                  {genericItems.map((item) => (
                    <div key={item.templateItemId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.area}</p>
                        <StatusBadge tone={CHECKLIST_ITEM_STATUS_META[item.status ?? "na"].tone}>
                          {CHECKLIST_ITEM_STATUS_META[item.status ?? "na"].label}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                      {item.note ? <p className="text-sm">{item.note}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
              {welfareItem ? (
                <Card>
                  <CardContent className="pt-6">
                    <WelfareSection
                      siteId={staffMember.siteId}
                      roundId={round.id}
                      templateItemId={welfareItem.templateItemId}
                      readOnly
                    />
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      )}

      <p className="mt-6">
        <Link href="/night-checks" className="text-sm text-primary underline">
          Back to tonight&rsquo;s rounds
        </Link>
      </p>
    </>
  );
}
