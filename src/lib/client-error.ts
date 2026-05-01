"use client";

import { APP_CODENAME, APP_VERSION } from "./version";

const RECENT_ERROR_TTL_MS = 60_000;
const recentErrors = new Map<string, number>();

export interface ClientErrorPayload {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  route?: string;
  userAgent?: string;
  appVersion?: string;
  appCodename?: string;
}

function shouldReport(key: string): boolean {
  const now = Date.now();
  const last = recentErrors.get(key);
  if (last && now - last < RECENT_ERROR_TTL_MS) {
    return false;
  }
  recentErrors.set(key, now);
  return true;
}

export function logClientError(error: unknown, componentStack?: string | null): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;
  const key = `${message}:${componentStack ?? ""}`;

  if (!shouldReport(key)) {
    return;
  }

  const payload: ClientErrorPayload = {
    message: message.slice(0, 2_000),
    stack: stack?.slice(0, 8_000) ?? null,
    componentStack: componentStack?.slice(0, 8_000) ?? null,
    route: window.location.pathname,
    userAgent: window.navigator.userAgent,
    appVersion: APP_VERSION,
    appCodename: APP_CODENAME
  };

  void fetch("/api/error-log", {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST"
  }).catch(() => undefined);
}
