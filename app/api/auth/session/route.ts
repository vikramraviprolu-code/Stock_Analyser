import { NextResponse } from "next/server";
import { authSessionResponse } from "@/src/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(await authSessionResponse(request));
}
