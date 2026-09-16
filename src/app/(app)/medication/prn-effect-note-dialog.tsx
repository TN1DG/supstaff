"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { editPrnEffectNote } from "./actions";

export function PrnEffectNoteDialog({
  administrationId,
  medicationLabel,
}: {
  administrationId: string;
  medicationLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Add effect note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await editPrnEffectNote(administrationId, {}, fd);
              if (res.error) {
                setError(res.error);
              } else {
                setOpen(false);
                setError(null);
                toast.success("Effect note saved");
                router.refresh();
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>How did it help?</DialogTitle>
            <DialogDescription>{medicationLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Textarea
              name="prnEffectNote"
              rows={3}
              autoFocus
              placeholder="e.g. settled within 30 minutes"
              required
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
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
