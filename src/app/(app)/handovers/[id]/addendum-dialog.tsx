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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { classifyFormError } from "@/lib/form-error-tone";
import { addAddendum } from "../actions";

export function AddendumDialog({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add a note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await addAddendum(handoverId, fd);
              if (res.error) {
                setError(res.error);
              } else {
                setOpen(false);
                toast.success("Note added");
                router.refresh();
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Add a note to this handover</DialogTitle>
            <DialogDescription>
              The handover stays as it was submitted; your note is added below it
              with your name and the time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="body">Note</Label>
              <Textarea id="body" name="body" rows={4} autoFocus required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">Signing PIN</Label>
              <Input
                id="pin"
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                required
              />
            </div>
            {error
              ? (() => {
                  const { tone, icon: Icon } = classifyFormError(error);
                  return (
                    <Alert variant={tone === "info" ? "info" : "destructive"} className="py-2">
                      <Icon />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  );
                })()
              : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
