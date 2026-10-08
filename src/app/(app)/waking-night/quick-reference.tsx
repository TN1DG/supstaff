import { Phone, ShieldAlert } from "lucide-react";
import type { SiteConfig } from "@/lib/site-settings";

type Dial = { label: string; number: string | null; note?: string };

/** Strip spaces etc. for the tel: link; keep a leading +. */
function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

/**
 * The quick-dial panel: every number comes from service settings — nothing
 * is hard-coded, and a number nobody has entered says so rather than
 * guessing. Plus the lone-worker device reminder where the service has one.
 */
export function QuickReference({ config, compact = false }: { config: SiteConfig; compact?: boolean }) {
  const dials: Dial[] = [
    { label: "OOH repairs", number: config.oohRepairsPhone },
    { label: "On-call manager", number: config.onCallManagerPhone },
    { label: "Emergency", number: config.emergencyPhone, note: "Police, fire, ambulance" },
    { label: "NHS non-emergency", number: config.nhsPhone },
    { label: "Police non-emergency", number: config.policeNonEmergencyPhone },
  ];

  return (
    <div className="space-y-3">
      {!compact ? <p className="text-sm font-medium">Quick reference</p> : null}
      <ul className="space-y-2">
        {dials.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {d.label}
              {d.note && !compact ? (
                <span className="block text-xs text-muted-foreground">{d.note}</span>
              ) : null}
            </span>
            {d.number ? (
              <a
                href={telHref(d.number)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-primary hover:bg-accent/30"
              >
                <Phone className="size-3.5" aria-hidden />
                {d.number}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Not set</span>
            )}
          </li>
        ))}
      </ul>
      {config.hasLoneWorkerDevice ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Carry the lone worker device for the whole shift.
        </p>
      ) : null}
    </div>
  );
}
