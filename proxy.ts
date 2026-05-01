import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applySecurityHeaders, enforceApiRequestSecurity } from "@/src/lib/security";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const blocked = enforceApiRequestSecurity(request);
    if (blocked) return blocked;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
