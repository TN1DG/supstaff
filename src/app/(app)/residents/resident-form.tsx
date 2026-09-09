"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Resident } from "@/db/schema";
import type { ResidentFormState } from "./actions";

type Action = (
  prev: ResidentFormState,
  formData: FormData,
) => Promise<ResidentFormState>;

export function ResidentForm({
  action,
  resident,
  keyWorkers,
}: {
  action: Action;
  resident?: Resident;
  keyWorkers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    ResidentFormState,
    FormData
  >(action, {});
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={err("firstName")}>
          <Input name="firstName" defaultValue={resident?.firstName} required />
        </Field>
        <Field label="Last name" error={err("lastName")}>
          <Input name="lastName" defaultValue={resident?.lastName} required />
        </Field>
        <Field label="Preferred name" error={err("preferredName")} optional>
          <Input
            name="preferredName"
            defaultValue={resident?.preferredName ?? ""}
          />
        </Field>
        <Field label="Room" error={err("room")} optional>
          <Input name="room" defaultValue={resident?.room ?? ""} />
        </Field>
        <Field label="Date of birth" error={err("dateOfBirth")} optional>
          <Input
            type="date"
            name="dateOfBirth"
            defaultValue={resident?.dateOfBirth ?? ""}
          />
        </Field>
        <Field label="Admission date" error={err("admissionDate")} optional>
          <Input
            type="date"
            name="admissionDate"
            defaultValue={resident?.admissionDate ?? ""}
          />
        </Field>
        <Field label="Key worker" error={err("keyWorkerId")} optional>
          <Select name="keyWorkerId" defaultValue={resident?.keyWorkerId ?? ""}>
            <SelectTrigger>
              <SelectValue placeholder="Not assigned" />
            </SelectTrigger>
            <SelectContent>
              {keyWorkers.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status" error={err("status")}>
          <Select name="status" defaultValue={resident?.status ?? "active"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">In the house</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
              <SelectItem value="discharged">Discharged</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Risk flags"
        error={err("riskFlags")}
        optional
        hint="Comma separated, e.g. Falls risk, Leaves without notice"
      >
        <Input
          name="riskFlags"
          defaultValue={resident?.riskFlags?.join(", ") ?? ""}
        />
      </Field>

      <Field label="Support notes" error={err("supportNotes")} optional>
        <Textarea
          name="supportNotes"
          rows={5}
          defaultValue={resident?.supportNotes ?? ""}
        />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : resident ? "Save changes" : "Add resident"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={resident ? `/residents/${resident.id}` : "/residents"}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {optional ? (
          <span className="text-xs font-normal text-muted-foreground">
            optional
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
