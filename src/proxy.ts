import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Optimistic route guard for pages only. Real authorization happens in every
 * API handler and server layout (DB-backed); this just avoids rendering a
 * protected shell for signed-out users and sends each role to its own portal.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    if (claims) return NextResponse.redirect(new URL(claims.role === "ADMIN" ? "/admin" : "/author", req.url));
    return NextResponse.next();
  }
  if (!claims) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && claims.role !== "ADMIN") return NextResponse.redirect(new URL("/author", req.url));
  if (pathname.startsWith("/author") && claims.role !== "AUTHOR") return NextResponse.redirect(new URL("/admin", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/author/:path*", "/admin/:path*"] };
