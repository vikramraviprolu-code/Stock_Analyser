import { NextResponse } from "next/server";
import { clearAuthSessionCookie, deleteLocalUser, getAuthUserFromRequest, workspaceOwnerIdForUser } from "@/src/lib/auth";
import { purgeWorkspaceData } from "@/src/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const confirmation = searchParams.get("confirm") ?? request.headers.get("x-delete-confirmation");
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: "Account deletion requires confirm=DELETE." }, { status: 400 });
  }

  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "No authenticated local account is active." }, { status: 401 });
  }

  await purgeWorkspaceData(workspaceOwnerIdForUser(user));
  await deleteLocalUser(user.id);
  const response = NextResponse.json({
    mode: "local-auth",
    retrievedAt: new Date().toISOString(),
    deleted: true,
    status: {
      label: "Local account deletion",
      status: "ok",
      detail: "Local account credentials and the scoped workspace have been deleted.",
      url: null
    }
  });
  clearAuthSessionCookie(response);
  return response;
}
