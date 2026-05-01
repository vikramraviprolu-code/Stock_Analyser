import { NextResponse } from "next/server";
import { authSessionResponse, clearAuthSessionCookie } from "@/src/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.json({
    ...(await authSessionResponse(new Request(request.url))),
    authenticated: false,
    user: null,
    workspaceOwnerId: "anonymous:local-default",
    warnings: ["You are using the anonymous local workspace. Create or sign into a local account to isolate workspace data by user."],
    status: {
      label: "Anonymous workspace",
      status: "warning",
      detail: "Signed out. Workspace requests now use the anonymous local workspace.",
      url: null
    }
  });
  clearAuthSessionCookie(response);
  return response;
}
