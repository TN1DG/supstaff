"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeHandover } from "../actions";

export function AcknowledgeButton({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await acknowledgeHandover(handoverId);
          toast.success("Marked as read");
          router.refresh();
        })
      }
    >
      <Check className="size-4" />
      {pending ? "Saving…" : "I've read this"}
    </Button>
  );
}
