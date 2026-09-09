"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Staff } from "@/db/schema";
import type { StaffFormState } from "./actions";
import { TempPasswordCard } from "./temp-password-card";

type Action = (
  prev: StaffFormState,
  formData: FormData,
) => Promise<StaffFormState>;

export function StaffForm({
  action,
  person,
}: {
  action: Action;
  person?: Staff;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (person && !result.error && !result.fieldErrors) {
        toast.success("Staff member updated");
        router.push("/staff");
      }
      return result;
    },
    {},
  );
  const [role, setRole] = useState<string>(person?.role ?? "support_officer");
  const err = (f: string) => state.fieldErrors?.[f];

  if (state.tempPassword) {
    return (
      <TempPasswordCard
        name={state.createdName ?? "The new account"}
        password={state.tempPassword}
        backHref="/staff"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input name="name" defaultValue={person?.name} required />
          {err("name") ? (
            <p className="text-xs text-destructive">{err("name")}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input
            name="email"
            type="email"
            defaultValue={person?.email}
            required
          />
          {err("email") ? (
            <p className="text-xs text-destructive">{err("email")}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select name="role" value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_staff">Bank staff (temporary)</SelectItem>
              <SelectItem value="support_officer">Support officer</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Phone
            <span className="text-xs font-normal text-muted-foreground">
              optional
            </span>
          </Label>
          <Input name="phone" defaultValue={person?.phone ?? ""} />
        </div>
        {role === "bank_staff" ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              Engagement ends
              <span className="text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              name="engagedUntil"
              type="date"
              defaultValue={person?.engagedUntil ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              The account stops working the day after this date.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            name="isAdmin"
            defaultChecked={person?.isAdmin ?? false}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">System admin</span>
            <span className="block text-muted-foreground">
              Can manage integrations and setup. Normally just the manager.
            </span>
          </span>
        </label>
        {person ? (
          <label className="flex items-start gap-3">
            <Checkbox
              name="active"
              defaultChecked={person.active}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Active</span>
              <span className="block text-muted-foreground">
                Unchecked accounts cannot sign in.
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : person
              ? "Save changes"
              : "Create account"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/staff">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
