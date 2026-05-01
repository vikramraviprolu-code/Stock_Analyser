import { NextResponse } from "next/server";
import { authSessionResponse, registerLocalUser, setAuthSessionCookie } from "@/src/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { username?: string; passphrase?: string };
  try {
    const user = await registerLocalUser(payload.username ?? "", payload.passphrase ?? "");
    const body = await authSessionResponse(new Request(request.url, { headers: request.headers }));
    const response = NextResponse.json({
      ...body,
      authenticated: true,
      user,
      workspaceOwnerId: `user:${user.id}`,
      warnings: ["This is a local encrypted account. Hosted cloud sync still needs a production identity provider."],
      status: {
        label: "Authenticated workspace",
        status: "ok",
        detail: "Local account created. Workspace requests are now scoped to this user.",
        url: null
      }
    });
    await setAuthSessionCookie(response, request, user);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}
