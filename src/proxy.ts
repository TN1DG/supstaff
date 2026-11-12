import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Two jobs:
 * 1. A lightweight optimistic gate — checks a session cookie is present and
 *    bounces to /login if not. Real authentication and role checks happen in
 *    route-group layouts and server actions via `requireStaff()` / `requireRole()`.
 * 2. The Content-Security-Policy, with a fresh nonce per request.
 */
const PUBLIC_PATHS = ["/login"];

/**
 * Next.js reads the nonce from the request's CSP header and stamps it on its
 * own scripts; with 'strict-dynamic' only those (and what they load) can run,
 * so injected markup can't execute script. Styles allow 'unsafe-inline'
 * because shadcn/Radix render style="" attributes, which a nonce can't cover.
 */
function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React needs eval in dev only, for server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Continue the request with the CSP on both the request (for Next) and the response (for the browser). */
function withCsp(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function hasSessionCookie(request: NextRequest) {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // No cookie-based bounce from /login to / — a cookie can outlive its session
  // (revoked, timed out), and the layout would send it straight back here in a
  // loop. The login page runs the real auth() check and redirects if valid.
  if (isPublic) return withCsp(request);

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return withCsp(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
