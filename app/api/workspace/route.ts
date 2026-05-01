import { NextResponse } from "next/server";
import { getAuthUserFromRequest, workspaceOwnerIdForUser } from "@/src/lib/auth";
import { deleteWorkspaceData, exportWorkspaceData, updatePrivacyConsent } from "@/src/lib/workspace-store";
import type { PrivacyConsent, WorkspaceDeleteResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  return NextResponse.json(await exportWorkspaceData(workspaceOwnerIdForUser(user), user !== null));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<Omit<PrivacyConsent, "updatedAt">>;
  const allowedKeys: Array<keyof Omit<PrivacyConsent, "updatedAt">> = ["analytics", "emailBriefs", "productUpdates"];
  const next: Partial<Omit<PrivacyConsent, "updatedAt">> = {};

  for (const key of allowedKeys) {
    if (typeof payload[key] === "boolean") {
      next[key] = payload[key];
    }
  }

  if (Object.keys(next).length === 0) {
    return NextResponse.json({ error: "At least one consent flag is required." }, { status: 400 });
  }

  const user = await getAuthUserFromRequest(request);
  const consent = await updatePrivacyConsent(next, workspaceOwnerIdForUser(user));
  return NextResponse.json({
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    consent,
    status: {
      label: "Privacy consent",
      status: "ok",
      detail: "Consent preferences were updated for this app instance.",
      url: null
    }
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const confirmation = searchParams.get("confirm") ?? request.headers.get("x-delete-confirmation");
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: "Workspace deletion requires confirm=DELETE." }, { status: 400 });
  }

  const user = await getAuthUserFromRequest(request);
  await deleteWorkspaceData(workspaceOwnerIdForUser(user));
  const response: WorkspaceDeleteResponse = {
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    deleted: true,
    status: {
      label: "Workspace deletion",
      status: "ok",
      detail: "All user-entered workspace data for this app instance has been deleted.",
      url: null
    }
  };
  return NextResponse.json(response);
}
