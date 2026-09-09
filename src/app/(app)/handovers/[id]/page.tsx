import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { handovers, outbox } from "@/db/schema";
import { requireStaff } from "@/lib/rbac";
import {
  buildHandoverPayload,
  handoverToText,
  shiftLabel,
} from "@/lib/handover-payload";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SubmitHandoverDialog } from "./submit-dialog";
import { AddendumDialog } from "./addendum-dialog";
import { AcknowledgeButton } from "./acknowledge-button";
import { SalesforcePanel } from "./salesforce-panel";

export const metadata: Metadata = { title: "Handover" };

const dtf = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function HandoverPage({
  params,
}: PageProps<"/handovers/[id]">) {
  const { id } = await params;
  const staff = await requireStaff();
  const db = getDb();

  const handover = await db.query.handovers.findFirst({
    where: and(eq(handovers.id, id), eq(handovers.siteId, staff.siteId)),
    with: {
      startedBy: { columns: { name: true } },
      submittedBy: { columns: { name: true } },
      entries: { columns: { lastEditedByStaffId: true } },
      acknowledgements: { with: { staff: { columns: { name: true } } } },
    },
  });
  if (!handover) notFound();

  const payload = await buildHandoverPayload(id, staff.siteId);
  const isDraft = handover.status === "draft";
  // Any staff on shift can pick up a draft; submitting locks it.
  const canEdit = isDraft;
  const hasContributed =
    handover.startedByStaffId === staff.id ||
    handover.submittedByStaffId === staff.id ||
    handover.entries.some((e) => e.lastEditedByStaffId === staff.id);
  const hasAcknowledged = handover.acknowledgements.some(
    (a) => a.staffId === staff.id,
  );

  const queued = !isDraft
    ? await db.$count(
        outbox,
        and(
          eq(outbox.entityType, "handover"),
          eq(outbox.entityId, id),
          eq(outbox.target, "salesforce"),
        ),
      )
    : 0;

  const dateLong = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
  }).format(new Date(handover.handoverDate));

  return (
    <>
      <PageHeader
        title={`${shiftLabel(handover.shift)} shift`}
        description={dateLong}
      >
        <Button variant="outline" asChild>
          <Link href={`/handovers/${id}/pdf`} target="_blank">
            PDF
          </Link>
        </Button>
        {canEdit ? (
          <Button variant="outline" asChild>
            <Link href={`/handovers/${id}/edit`}>Continue editing</Link>
          </Button>
        ) : null}
        {canEdit ? <SubmitHandoverDialog handoverId={id} /> : null}
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Badge variant={isDraft ? "outline" : "secondary"}>
          {isDraft ? "Draft" : "Submitted"}
        </Badge>
        <span>Started by {handover.startedBy.name}</span>
        {handover.submittedAt ? (
          <span>
            · Submitted {dtf.format(handover.submittedAt)}
            {handover.submittedBy ? ` · ${handover.submittedBy.name}` : ""}
          </span>
        ) : null}
      </div>

      {payload.contributors.length > 1 ? (
        <p className="mb-6 -mt-3 text-sm text-muted-foreground">
          Contributors: {payload.contributors.join(", ")}
        </p>
      ) : null}

      {isDraft ? (
        <Alert className="mb-6">
          <AlertTitle>This handover is still a draft</AlertTitle>
          <AlertDescription>
            It won&rsquo;t show up for the next shift or go to Salesforce until
            it&rsquo;s submitted.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {handover.generalNotes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">House notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {handover.generalNotes}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            {payload.entries.map((e, i) => {
              const empty =
                !e.narrative &&
                !e.moodObservations &&
                !e.tasksOutstanding &&
                !e.appointments;
              return (
                <Card key={i}>
                  <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-base">
                      {e.resident}
                      {e.room ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          Room {e.room}
                        </span>
                      ) : null}
                    </CardTitle>
                    {e.incidentFlag ? (
                      <Badge className="border-destructive/40 bg-destructive/10 text-destructive">
                        Incident logged
                      </Badge>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {empty ? (
                      <p className="text-muted-foreground">
                        Nothing to report this shift.
                      </p>
                    ) : (
                      <>
                        <Detail label="How the shift went" text={e.narrative} />
                        <Detail
                          label="Mood / observations"
                          text={e.moodObservations}
                        />
                        <Detail
                          label="Tasks outstanding"
                          text={e.tasksOutstanding}
                        />
                        <Detail label="Appointments" text={e.appointments} />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {!isDraft ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Notes added afterwards</CardTitle>
                <AddendumDialog handoverId={id} />
              </CardHeader>
              <CardContent className="space-y-3">
                {payload.addenda.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  payload.addenda.map((a, i) => (
                    <div
                      key={i}
                      className="border-l-2 border-warning/60 pl-3 text-sm"
                    >
                      <p className="text-xs text-muted-foreground">
                        {a.author} · {dtf.format(new Date(a.at))}
                      </p>
                      <p className="whitespace-pre-wrap">{a.body}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {!isDraft ? (
            <SalesforcePanel
              handoverId={id}
              summary={handoverToText(payload)}
              synced={queued > 0}
            />
          ) : null}

          {!isDraft ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Read by</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!hasContributed && !hasAcknowledged ? (
                  <AcknowledgeButton handoverId={id} />
                ) : null}
                {handover.acknowledgements.length === 0 ? (
                  <p className="text-muted-foreground">No one yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {handover.acknowledgements.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>{a.staff.name}</span>
                        <span className="text-muted-foreground">
                          {dtf.format(a.readAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}
