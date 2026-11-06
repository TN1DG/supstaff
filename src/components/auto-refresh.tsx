"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the page's server data every `seconds` while the tab is visible,
 * for screens whose status changes with the clock (a check falls due with
 * nobody touching anything). Skips a tick while a dialog is open so it never
 * interrupts someone mid-form.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector('[role="dialog"]')) return;
      router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
