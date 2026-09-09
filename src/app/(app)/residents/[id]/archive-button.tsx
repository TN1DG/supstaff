"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { archiveResident } from "../actions";

export function ArchiveResidentButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [pending, start] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">Archive</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {name}?</DialogTitle>
          <DialogDescription>
            Their record is kept for audit and reporting, but they&rsquo;ll be
            marked discharged and hidden from day-to-day lists. A manager can
            restore them later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await archiveResident(id);
                toast.success(`${name} archived`);
              })
            }
          >
            {pending ? "Archiving…" : "Archive resident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
