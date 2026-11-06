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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import {
  cancelAbsence,
  changeAbsenceReturn,
  createAbsence,
  markAbsenceBack,
  type WelfareActionState,
} from "./actions";
import { Choice } from "./when-field";

export function CreateAbsenceDialog({
  residentId,
  residentName,
}: {
  residentId: string;
  residentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<"now" | "later">("now");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setError(null);
          setLeaving("now");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Planned absence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await createAbsence(residentId, {}, fd);
              if (res.ok) {
                setOpen(false);
                toast.success(res.message ?? "Saved");
                router.refresh();
              } else {
                setError(res.error ?? "Something went wrong.");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Planned absence</DialogTitle>
            <DialogDescription>
              {residentName} &middot; their checks pause until they&rsquo;re due
              back. If they&rsquo;re not back by then, they show as overdue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium">Leaving</legend>
              <div className="flex flex-wrap items-center gap-2">
                <Choice name="leaving" value="now" checked={leaving === "now"} onChange={() => setLeaving("now")}>
                  Now
                </Choice>
                <Choice
                  name="leaving"
                  value="later"
                  checked={leaving === "later"}
                  onChange={() => setLeaving("later")}
                >
                  At another time
                </Choice>
                {leaving === "later" ? (
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    required
                    aria-label="Leaving at"
                    className="w-auto"
                  />
                ) : null}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="expectedBackAt">Expected back</Label>
              <Input
                id="expectedBackAt"
                name="expectedBackAt"
                type="datetime-local"
                required
                className="w-auto"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason" className="flex items-center gap-1.5">
                Where or why
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </Label>
              <Input
                id="reason"
                name="reason"
                maxLength={300}
                placeholder="e.g. Weekend at their sister's"
              />
            </div>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save absence"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeReturnDialog({
  absenceId,
  residentName,
  currentValue,
}: {
  absenceId: string;
  residentName: string;
  /** The current expected-back time as a datetime-local value. */
  currentValue: string;
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
        <Button size="sm" variant="ghost">
          Change return
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await changeAbsenceReturn(absenceId, {}, fd);
              if (res.ok) {
                setOpen(false);
                toast.success(res.message ?? "Saved");
                router.refresh();
              } else {
                setError(res.error ?? "Something went wrong.");
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Change when they&rsquo;re due back</DialogTitle>
            <DialogDescription>{residentName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-3">
            <Label htmlFor="newExpectedBackAt">Expected back</Label>
            <Input
              id="newExpectedBackAt"
              name="expectedBackAt"
              type="datetime-local"
              defaultValue={currentValue}
              required
              className="w-auto"
            />
            <FormError message={error} />
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

/** One-click absence actions: "Back" (logs them seen) or "Cancel". */
export function AbsenceActionButton({
  absenceId,
  kind,
}: {
  absenceId: string;
  kind: "back" | "cancel";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={kind === "back" ? "default" : "ghost"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res: WelfareActionState =
            kind === "back" ? await markAbsenceBack(absenceId) : await cancelAbsence(absenceId);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            router.refresh();
          } else {
            toast.error(res.error ?? "Something went wrong.");
          }
        })
      }
    >
      {pending ? "Saving…" : kind === "back" ? "They're back" : "Cancel absence"}
    </Button>
  );
}
