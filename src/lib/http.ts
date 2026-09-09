import { headers } from "next/headers";

/**
 * Best-effort client IP from proxy headers. On Vercel `x-forwarded-for` is set
 * by the platform edge and is trustworthy; the left-most entry is the client.
 */
export function clientIp(h: Headers): string | null {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  );
}

/** `clientIp` for contexts that don't already hold a `Headers` instance. */
export async function requestIp(): Promise<string | null> {
  return clientIp(await headers());
}
