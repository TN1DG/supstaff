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
  createTemplateItem,
  updateTemplateItem,
  type TemplateItemFormState,
} from "../actions";

function Fields({
  fieldErrors,
  area,
  description,
}: {
  fieldErrors?: Record<string, string>;
  area?: string;
  description?: string;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="area">Area</Label>
        <Input id="area" name="area" defaultValue={area} placeholder="e.g. Front door" required />
        {fieldErrors?.area ? (
          <p className="text-xs text-destructive">{fieldErrors.area}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">What to check</Label>
        <Input
          id="description"
          name="description"
          defaultValue={description}
          placeholder="e.g. Locked and alarm set"
          required
        />
        {fieldErrors?.description ? (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AddItemDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TemplateItemFormState>({});
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
        <Button>Add item</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await createTemplateItem(state, fd);
              if (res.error || res.fieldErrors) {
                setState(res);
              } else {
                setOpen(false);
                setState({});
                toast.success("Checklist item added");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Add a checklist item</DialogTitle>
            <DialogDescription>
              Shown on every round checked in from now on.
            </DialogDescription>
          </DialogHeader>
          <Fields fieldErrors={state.fieldErrors} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditItemDialog({
  id,
  area,
  description,
}: {
  id: string;
  area: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TemplateItemFormState>({});
  const [pending, start] = useTransition();
  const boundUpdate = updateTemplateItem.bind(null, id);

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
                toast.success("Checklist item updated");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Edit checklist item</DialogTitle>
          </DialogHeader>
          <Fields fieldErrors={state.fieldErrors} area={area} description={description} />
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
