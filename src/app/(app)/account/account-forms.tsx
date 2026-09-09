"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { changePassword, setPin, type AccountState } from "./actions";

function Feedback({ state }: { state: AccountState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.ok) {
    return (
      <Alert className="border-success/50 bg-success/10 text-foreground [&>svg]:text-success">
        <AlertDescription className="text-foreground">
          {state.ok}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    changePassword,
    {},
  );
  return (
    <form action={action} className="max-w-sm space-y-4">
      <Feedback state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}

export function SetPinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    setPin,
    {},
  );
  return (
    <form action={action} className="max-w-sm space-y-4">
      <Feedback state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="pin">{hasPin ? "New PIN" : "Choose a PIN"}</Label>
        <Input
          id="pin"
          name="pin"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          placeholder="4–6 digits"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm PIN</Label>
        <Input
          id="confirm"
          name="confirm"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Confirm with your password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : hasPin ? "Update PIN" : "Save PIN"}
      </Button>
    </form>
  );
}
