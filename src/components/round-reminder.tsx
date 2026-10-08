"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type RoundInfo = { roundTime: string; scheduledAt: string; state: string };

const POLL_MS = 60_000;
const STORAGE_KEY = "supstaff:round-reminders";

/** Keys already announced this browser session, so a reload doesn't re-alert. */
function loadNotified(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveNotified(keys: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Private mode / blocked storage — reminders still work, just may repeat.
  }
}

/** A short two-tone chime; silently does nothing if audio is blocked. */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
  } catch {
    // ignore
  }
}

/**
 * Round-due reminders while the app is open: a banner, a toast, a chime and
 * (if allowed) a browser notification. Polls tonight's rounds every minute;
 * stays silent unless a waking-night shift is open. No web push — if the app
 * isn't open, the overdue/missed states on the shift page are the backstop.
 */
export function RoundReminder() {
  const [alert, setAlert] = useState<{ roundTime: string; overdue: boolean } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const notified = useRef<Set<string> | null>(null);

  const check = useCallback(async () => {
    let rounds: RoundInfo[];
    try {
      const res = await fetch("/api/waking-night/rounds", { cache: "no-store" });
      if (!res.ok) return;
      rounds = (await res.json()).rounds;
    } catch {
      return;
    }
    if ("Notification" in window) setPermission(Notification.permission);
    notified.current ??= loadNotified();
    const pending = rounds.find((r) => r.state === "due" || r.state === "overdue");
    if (!pending) {
      setAlert(null);
      return;
    }
    const overdue = pending.state === "overdue";
    setAlert({ roundTime: pending.roundTime, overdue });

    const key = `${pending.scheduledAt}|${pending.state}`;
    if (notified.current.has(key)) return;
    notified.current.add(key);
    saveNotified(notified.current);

    const message = overdue
      ? `The ${pending.roundTime} welfare round is overdue`
      : `The ${pending.roundTime} welfare round is due`;
    toast.warning(message);
    chime();
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Supstaff", { body: message, tag: key });
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 0);
    const id = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (!alert) return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-warning/40 bg-background p-4 shadow-lg"
    >
      <BellRing className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div className="space-y-2 text-sm">
        <p className="font-medium">
          The {alert.roundTime} welfare round is {alert.overdue ? "overdue" : "due"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href="/waking-night">Go to rounds</Link>
          </Button>
          {permission === "default" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => setPermission(await Notification.requestPermission())}
            >
              Enable alerts
            </Button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setAlert(null)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
