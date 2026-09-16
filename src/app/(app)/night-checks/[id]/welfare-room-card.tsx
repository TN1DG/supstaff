"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { saveRoomCheck, type SaveRoomCheckState } from "../actions";

type SituationType = { id: string; label: string };

export function WelfareRoomCard({
  roundId,
  templateItemId,
  roomNumber,
  residentLabel,
  situationTypes,
  initialSituationIds,
  initialSituationLabels,
  initialNote,
  readOnly,
}: {
  roundId: string;
  templateItemId: string;
  roomNumber: number;
  residentLabel: string | null;
  situationTypes: SituationType[];
  initialSituationIds: string[];
  initialSituationLabels: string[];
  initialNote: string | null;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<SaveRoomCheckState, FormData>(
    saveRoomCheck.bind(null, roundId, templateItemId, roomNumber),
    {},
  );

  if (readOnly) {
    const flagged = initialSituationLabels.length > 0 || !!initialNote;
    return (
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            Room {roomNumber}
            {residentLabel ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {residentLabel}
              </span>
            ) : null}
          </p>
          {!flagged ? <StatusBadge tone="success">No issues</StatusBadge> : null}
        </div>
        {flagged ? (
          <div className="mt-2 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {initialSituationLabels.map((label) => (
                <StatusBadge key={label} tone="warning">
                  {label}
                </StatusBadge>
              ))}
            </div>
            {initialNote ? <p className="text-sm">{initialNote}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          Room {roomNumber}
          {residentLabel ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {residentLabel}
            </span>
          ) : (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              No resident currently assigned
            </span>
          )}
        </p>
      </div>

      {situationTypes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {situationTypes.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                name="situationTypeId"
                value={s.id}
                defaultChecked={initialSituationIds.includes(s.id)}
              />
              {s.label}
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No situation types configured — ask a manager to set some up.
        </p>
      )}

      <Textarea
        name="note"
        rows={1}
        defaultValue={initialNote ?? ""}
        placeholder="Optional note"
        className="mt-2 text-sm"
      />

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save room"}
        </Button>
        {state.error ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : state.ok ? (
          <p className="text-xs text-primary">Saved</p>
        ) : null}
      </div>
    </form>
  );
}
