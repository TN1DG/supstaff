import type { Metadata } from "next";
import { AlertTriangle, Info } from "lucide-react";
import { requireStaff } from "@/lib/rbac";
import { TONE, type StatusTone } from "@/lib/status-tone";
import { riskFlagDescription } from "@/lib/residents";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TooltipStatusBadge } from "@/components/tooltip-status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Design" };

const TONE_ROWS: { tone: StatusTone; meaning: string; example: string }[] = [
  { tone: "success", meaning: "Good / done / nothing wrong", example: "Given, Complete, Submitted" },
  { tone: "info", meaning: "Informational / in progress / a classification", example: "In progress, Draft, CD, Not available" },
  { tone: "warning", meaning: "Needs attention / review", example: "Due now, Refused, Falls risk" },
  { tone: "danger", meaning: "Missed / failed / locked out / a real problem", example: "Missed, Incident logged, Locked out" },
  { tone: "neutral", meaning: "Not applicable yet / inactive / historical", example: "Not due yet, Discharged, N/A" },
];

const SWATCHES = [
  ["Background", "bg-background border"],
  ["Card", "bg-card border"],
  ["Primary — sage", "bg-primary"],
  ["Secondary — sand", "bg-secondary"],
  ["Accent — teal", "bg-accent"],
  ["Muted", "bg-muted"],
  ["Warning — amber", "bg-warning"],
  ["Success", "bg-success"],
  ["Destructive — coral", "bg-destructive"],
];

export default async function DesignPage() {
  await requireStaff();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Design reference"
        description="The calm, welcoming look Supstaff is built on. Kept up to date as components are added."
      />

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Colour</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="space-y-1.5">
              <div className={`h-16 rounded-lg ${cls}`} />
              <p className="text-xs text-muted-foreground">{name}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Type</h2>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Heading one</h1>
          <h2 className="text-2xl font-semibold">Heading two</h2>
          <h3 className="text-lg font-medium">Heading three</h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Body text sits at a comfortable size with generous line height so it
            stays easy to read at the end of a long shift.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <TooltipStatusBadge tone="warning" tooltip={riskFlagDescription("Falls risk")}>
            Falls risk
          </TooltipStatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          Hover or focus a risk flag to see what it means — every free-text
          flag staff type gets a plain-language hint, not just the label.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Status tones</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Every colored badge or alert for a situation (a dose outcome, a
          round status, a resident status, …) uses one of these five tones —
          color always paired with an icon and a text label, never color
          alone.
        </p>
        <div className="space-y-3">
          {TONE_ROWS.map(({ tone, meaning, example }) => {
            const { icon: ToneIcon } = TONE[tone];
            return (
              <div
                key={tone}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border p-3"
              >
                <StatusBadge tone={tone} className="w-28 justify-center">
                  {tone}
                </StatusBadge>
                <ToneIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-sm">{meaning}</p>
                <p className="text-xs text-muted-foreground sm:ml-auto">{example}</p>
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>An example warning alert.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info />
            <AlertDescription>An example info alert.</AlertDescription>
          </Alert>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Form field</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="demo">Resident name</Label>
            <Input id="demo" placeholder="e.g. Aisha Bello" />
          </CardContent>
        </Card>
        <div className="space-y-3">
          <Alert>
            <AlertTitle>Gentle note</AlertTitle>
            <AlertDescription>
              Informational messages use a calm, quiet style.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertDescription>
              Problems use muted coral — clear, not alarming.
            </AlertDescription>
          </Alert>
        </div>
      </section>
    </div>
  );
}
