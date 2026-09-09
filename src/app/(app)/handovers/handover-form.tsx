"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveHouseNotes,
  saveResidentEntry,
  type SectionSaveState,
} from "./actions";

export type ResidentEntry = {
  residentId: string;
  name: string;
  room: string | null;
  isKeyWorker: boolean;
  narrative: string | null;
  moodObservations: string | null;
  tasksOutstanding: string | null;
  appointments: string | null;
  incidentFlag: boolean;
  /** epoch-ms string; "" when this card has never been saved */
  updatedAt: string;
  lastEditedBy: string | null;
};

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const fmtTime = (ms: number) => timeFmt.format(new Date(ms));

/** Shared "someone else got here first" banner + a way to pull their version in. */
function ConflictNotice({
  conflict,
  onReload,
}: {
  conflict: NonNullable<SectionSaveState["conflict"]>;
  onReload: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Someone else saved this first</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {conflict.editedBy} saved a newer version at{" "}
          {fmtTime(new Date(conflict.at).getTime())}. Reload to see it, then
          re-enter your change so nothing is lost.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onReload}>
          Reload this handover
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function SectionStatus({
  state,
  pending,
  serverStamp,
}: {
  state: SectionSaveState;
  pending: boolean;
  serverStamp: string | null;
}) {
  if (pending) return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (state.error)
    return <span className="text-xs text-destructive">{state.error}</span>;
  if (state.ok && state.savedAt)
    return (
      <span className="text-xs text-primary">
        Saved {fmtTime(new Date(state.savedAt).getTime())}
      </span>
    );
  if (serverStamp)
    return <span className="text-xs text-muted-foreground">{serverStamp}</span>;
  return null;
}

function ResidentEntryCard({
  handoverId,
  entry,
}: {
  handoverId: string;
  entry: ResidentEntry;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SectionSaveState, FormData>(
    saveResidentEntry.bind(null, handoverId, entry.residentId),
    {},
  );
  // Once we've saved, the base to compare against is our own save, not the load.
  const token =
    state.ok && state.savedAt
      ? String(new Date(state.savedAt).getTime())
      : entry.updatedAt;

  const serverStamp =
    entry.lastEditedBy && entry.updatedAt
      ? `Edited by ${entry.lastEditedBy} · ${fmtTime(Number(entry.updatedAt))}`
      : null;

  return (
    <Card id={`r-${entry.residentId}`}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">
          {entry.name}
          {entry.room ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Room {entry.room}
            </span>
          ) : null}
          {entry.isKeyWorker ? (
            <span className="ml-2 rounded bg-primary/12 px-1.5 py-0.5 text-xs font-medium text-primary">
              your key resident
            </span>
          ) : null}
        </CardTitle>
        <SectionStatus state={state} pending={pending} serverStamp={serverStamp} />
      </CardHeader>
      <CardContent>
        {state.conflict ? (
          <div className="mb-4">
            <ConflictNotice
              conflict={state.conflict}
              onReload={() => router.refresh()}
            />
          </div>
        ) : null}
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="expectedUpdatedAt" value={token} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="incident" defaultChecked={entry.incidentFlag} />
            Incident this shift
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>How the shift went</Label>
            <Textarea
              name="narrative"
              rows={3}
              defaultValue={entry.narrative ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mood / observations</Label>
            <Textarea
              name="mood"
              rows={2}
              defaultValue={entry.moodObservations ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tasks outstanding</Label>
            <Textarea
              name="tasks"
              rows={2}
              defaultValue={entry.tasksOutstanding ?? ""}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Appointments</Label>
            <Textarea
              name="appts"
              rows={2}
              defaultValue={entry.appointments ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save this resident"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function HouseNotesCard({
  handoverId,
  generalNotes,
  generalNotesUpdatedAt,
  generalNotesBy,
}: {
  handoverId: string;
  generalNotes: string | null;
  generalNotesUpdatedAt: string;
  generalNotesBy: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SectionSaveState, FormData>(
    saveHouseNotes.bind(null, handoverId),
    {},
  );
  const token =
    state.ok && state.savedAt
      ? String(new Date(state.savedAt).getTime())
      : generalNotesUpdatedAt;

  const serverStamp =
    generalNotesBy && generalNotesUpdatedAt
      ? `Edited by ${generalNotesBy} · ${fmtTime(Number(generalNotesUpdatedAt))}`
      : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">
          House notes
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            anything not about one resident
          </span>
        </CardTitle>
        <SectionStatus state={state} pending={pending} serverStamp={serverStamp} />
      </CardHeader>
      <CardContent>
        {state.conflict ? (
          <div className="mb-4">
            <ConflictNotice
              conflict={state.conflict}
              onReload={() => router.refresh()}
            />
          </div>
        ) : null}
        <form action={action} className="space-y-3">
          <input type="hidden" name="expectedUpdatedAt" value={token} />
          <Textarea
            name="generalNotes"
            rows={3}
            defaultValue={generalNotes ?? ""}
            placeholder="Visitors, deliveries, building issues, staffing for next shift…"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save house notes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function HandoverForm({
  handoverId,
  generalNotes,
  generalNotesUpdatedAt,
  generalNotesBy,
  entries,
}: {
  handoverId: string;
  handoverDate: string;
  shift: string;
  generalNotes: string | null;
  generalNotesUpdatedAt: string;
  generalNotesBy: string | null;
  entries: ResidentEntry[];
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Everyone on shift edits this handover together. Each section saves on
          its own — refresh the page to pull in what other people have written.
        </AlertDescription>
      </Alert>

      <HouseNotesCard
        handoverId={handoverId}
        generalNotes={generalNotes}
        generalNotesUpdatedAt={generalNotesUpdatedAt}
        generalNotesBy={generalNotesBy}
      />

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Residents</h2>
        {entries.map((e) => (
          <ResidentEntryCard
            key={`${e.residentId}:${e.updatedAt}`}
            handoverId={handoverId}
            entry={e}
          />
        ))}
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No active residents to hand over. Add residents first.
          </p>
        ) : null}
      </div>

      <div className="flex gap-3 rounded-xl border bg-background/90 p-3 text-sm">
        <Button variant="ghost" asChild>
          <Link href={`/handovers/${handoverId}`}>Back to handover</Link>
        </Button>
        <p className="ml-auto self-center text-xs text-muted-foreground">
          Submit from the handover page once the team is done.
        </p>
      </div>
    </div>
  );
}
