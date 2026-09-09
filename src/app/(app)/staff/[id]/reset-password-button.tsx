"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TempPasswordCard } from "../temp-password-card";
import { resetStaffPassword } from "../actions";

export function ResetPasswordButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTemp(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Reset password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {name}</DialogTitle>
          <DialogDescription>
            This replaces their current password with a new temporary one.
          </DialogDescription>
        </DialogHeader>

        {temp ? (
          <TempPasswordCard name={name} password={temp} backHref={`/staff/${id}`} />
        ) : (
          <div className="space-y-3">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await resetStaffPassword(id);
                  if (res.error) setError(res.error);
                  else if (res.tempPassword) setTemp(res.tempPassword);
                })
              }
            >
              {pending ? "Generating…" : "Generate temporary password"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
