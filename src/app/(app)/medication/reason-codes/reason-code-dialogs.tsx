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
  createReasonCode,
  updateReasonCode,
  type ReasonCodeFormState,
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
      <Label htmlFor="label">Reason</Label>
      <Input
        id="label"
        name="label"
        defaultValue={label}
        placeholder="e.g. Resident declined"
        required
      />
      {fieldErrors?.label ? (
        <p className="text-xs text-destructive">{fieldErrors.label}</p>
      ) : null}
    </div>
  );
}

export function AddReasonCodeDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReasonCodeFormState>({});
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
        <Button>Add reason</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await createReasonCode(state, fd);
              if (res.error || res.fieldErrors) {
                setState(res);
              } else {
                setOpen(false);
                setState({});
                toast.success("Reason code added");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Add a reason code</DialogTitle>
            <DialogDescription>
              Available whenever a dose is recorded as anything other than given.
            </DialogDescription>
          </DialogHeader>
          <Fields fieldErrors={state.fieldErrors} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add reason"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditReasonCodeDialog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReasonCodeFormState>({});
  const [pending, start] = useTransition();
  const boundUpdate = updateReasonCode.bind(null, id);

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
                toast.success("Reason code updated");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Edit reason code</DialogTitle>
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
