import type { Metadata } from "next";
import { requireStaff } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Design" };

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
          <Badge
            variant="outline"
            className="border-warning/50 bg-warning/10 text-warning-foreground"
          >
            Falls risk
          </Badge>
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
