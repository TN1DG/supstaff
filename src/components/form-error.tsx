import { Alert, AlertDescription } from "@/components/ui/alert";
import { classifyFormError } from "@/lib/form-error-tone";

/**
 * Renders a server action's error string with the icon and tone
 * `classifyFormError` picks for it — so "set a signing PIN" reads as a setup
 * nudge rather than a failure. The classifier already existed; only its
 * rendering was being copied between dialogs.
 */
export function FormError({
  message,
  className = "py-2",
}: {
  message?: string | null;
  /** Dialogs use the tighter `py-2`; pass `undefined` for default padding. */
  className?: string;
}) {
  if (!message) return null;

  const { tone, icon: Icon } = classifyFormError(message);

  return (
    <Alert
      variant={tone === "info" ? "info" : "destructive"}
      className={className}
    >
      <Icon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
