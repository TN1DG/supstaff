import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight optimistic gate only — it checks that a session cookie is present
 * and bounces to /login if not. Real authentication and role checks happen in
 * route-group layouts and server actions via `requireStaff()` / `requireRole()`.
 */
const PUBLIC_PATHS = ["/login"];

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
  if (isPublic) return NextResponse.next();

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
