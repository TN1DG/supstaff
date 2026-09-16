"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSituationType,
  updateSituationType,
  type SituationTypeFormState,
} from "../actions";

function Fields({
  fieldErrors,
  label,
}: {
  fieldErrors?: Record<string, string>;
  label?: string;
}) {
  return (
    <div className="space-y-1.5 py-2">
      <Label htmlFor="label">Situation</Label>
      <Input id="label" name="label" defaultValue={label} placeholder="e.g. Shouting" required />
      {fieldErrors?.label ? (
        <p className="text-xs text-destructive">{fieldErrors.label}</p>
      ) : null}
    </div>
  );
}

export function AddSituationTypeDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SituationTypeFormState>({});
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setState({});
      }}
    >
      <DialogTrigger asChild>
        <Button>Add situation</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await createSituationType(state, fd);
              if (res.error || res.fieldErrors) {
                setState(res);
              } else {
                setOpen(false);
                setState({});
                toast.success("Situation type added");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Add a welfare situation</DialogTitle>
            <DialogDescription>
              Available to tick on every room check from now on.
            </DialogDescription>
          </DialogHeader>
          <Fields fieldErrors={state.fieldErrors} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add situation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditSituationTypeDialog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SituationTypeFormState>({});
  const [pending, start] = useTransition();
  const boundUpdate = updateSituationType.bind(null, id);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setState({});
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await boundUpdate(state, fd);
              if (res.error || res.fieldErrors) {
                setState(res);
              } else {
                setOpen(false);
                setState({});
                toast.success("Situation type updated");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Edit welfare situation</DialogTitle>
          </DialogHeader>
          <Fields fieldErrors={state.fieldErrors} label={label} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
