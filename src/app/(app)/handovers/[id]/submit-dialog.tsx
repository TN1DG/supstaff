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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { classifyFormError } from "@/lib/form-error-tone";
import { submitHandover } from "../actions";

export function SubmitHandoverDialog({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Submit handover</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const res = await submitHandover(handoverId, fd);
              if (res.error) {
                setError(res.error);
              } else {
                setOpen(false);
                toast.success("Handover submitted");
                router.refresh();
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Submit this handover</DialogTitle>
            <DialogDescription>
              Once submitted it can&rsquo;t be edited — you can still add notes
              afterwards. It will be queued for Salesforce. Enter your signing
              PIN to confirm it&rsquo;s you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="pin">Signing PIN</Label>
            <Input
              id="pin"
              name="pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              autoFocus
              required
            />
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Confirm & submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
