/**
 * Gate for `/api/cron/*` routes. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`. Returns a `Response` to hand back when the caller isn't the
 * scheduler, or `null` when the request may proceed.
 *
 * Fails **closed** in production: if `CRON_SECRET` is unset the route is
 * unprotected, so we refuse to run rather than expose it.
 */
export function authorizeCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return new Response("Cron not configured", { status: 503 });
    }
    return null; // local dev convenience
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
