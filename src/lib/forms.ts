import type { ZodError } from "zod";

/** `{ field: message }` for the first error on each field — feeds `fieldErrors`. */
export function fieldErrors(error: ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((i) => [String(i.path[0] ?? ""), i.message]),
  );
}

/** The first human-readable message from a failed parse. */
export function firstIssue(error: ZodError, fallback = "Check your entries"): string {
  return error.issues[0]?.message ?? fallback;
}
