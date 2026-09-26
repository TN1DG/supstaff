import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The signing-PIN input used by every action that must be legally
 * attributable (handover submit, night-check complete, medication sign-off).
 * `maxLength` tracks `isValidPin` in src/lib/password.ts.
 */
export function PinField({
  name = "pin",
  label = "Signing PIN",
  autoFocus = false,
}: {
  name?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        required
      />
    </>
  );
}
