import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ErrorLogPayload {
  message?: unknown;
  stack?: unknown;
  componentStack?: unknown;
  route?: unknown;
  userAgent?: unknown;
  appVersion?: unknown;
  appCodename?: unknown;
}

function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.slice(0, maxLength);
}

export async function POST(request: Request) {
  let payload: ErrorLogPayload;
  try {
    payload = (await request.json()) as ErrorLogPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const message = safeString(payload.message, 2_000);
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const entry = {
    appCodename: safeString(payload.appCodename, 80),
    appVersion: safeString(payload.appVersion, 80),
    componentStack: safeString(payload.componentStack, 8_000),
    message,
    route: safeString(payload.route, 400),
    stack: safeString(payload.stack, 8_000),
    userAgent: safeString(payload.userAgent, 500),
    loggedAt: new Date().toISOString()
  };

  const directory = path.join(process.cwd(), ".cache", "stock-analyser");
  await mkdir(directory, { recursive: true });
  await appendFile(path.join(directory, "error-logs.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  console.error("[StockAnalyserError]", entry);

  return NextResponse.json({ ok: true });
}
