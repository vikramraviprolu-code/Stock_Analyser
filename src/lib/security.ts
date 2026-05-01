import { NextResponse } from "next/server";

const API_WINDOW_MS = 60_000;
const API_MAX_REQUESTS = 180;
const API_MAX_MUTATIONS = 45;
const API_MAX_BODY_BYTES = 64 * 1024;
const WORKER_SECRET_MIN_LENGTH = 32;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const localOrigins = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "https://stockanalyser.app:3443",
  "https://stockanalyser.app"
]);

function isDevRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function contentSecurityPolicy(): string {
  const scriptSrc = isDevRuntime() ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:3000 http://127.0.0.1:3100 https://stockanalyser.app:3443 https://stockanalyser.app ws://127.0.0.1:3000 ws://127.0.0.1:3100 wss://stockanalyser.app:3443",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy());
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "interest-cohort=()"
  ].join(", "));
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Download-Options", "noopen");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return response;
}

export function isMutationMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export function configuredWorkerSecret(): string | null {
  const secret = process.env.STOCK_ANALYSER_WORKER_SECRET?.trim() ?? "";
  return secret.length >= WORKER_SECRET_MIN_LENGTH ? secret : null;
}

export function workerSecretStatus(): { configured: boolean; minLength: number; warning: string | null } {
  const raw = process.env.STOCK_ANALYSER_WORKER_SECRET?.trim() ?? "";
  if (!raw) {
    return {
      configured: false,
      minLength: WORKER_SECRET_MIN_LENGTH,
      warning: "STOCK_ANALYSER_WORKER_SECRET is not configured, so hosted alert worker calls are disabled."
    };
  }
  if (raw.length < WORKER_SECRET_MIN_LENGTH) {
    return {
      configured: false,
      minLength: WORKER_SECRET_MIN_LENGTH,
      warning: `STOCK_ANALYSER_WORKER_SECRET must be at least ${WORKER_SECRET_MIN_LENGTH} characters.`
    };
  }
  return { configured: true, minLength: WORKER_SECRET_MIN_LENGTH, warning: null };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  let mismatch = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= left.charCodeAt(index % left.length) ^ right.charCodeAt(index % right.length);
  }
  return mismatch === 0;
}

export function workerRequestSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  return request.headers.get("x-stock-analyser-worker-secret")?.trim() || null;
}

export function isAuthorizedWorkerRequest(request: Request): boolean {
  const configured = configuredWorkerSecret();
  const supplied = workerRequestSecret(request);
  return configured !== null && supplied !== null && constantTimeEqual(configured, supplied);
}

export function isTrustedOrigin(origin: string | null, requestOrigin: string): boolean {
  if (!origin) return false;
  return origin === requestOrigin || localOrigins.has(origin);
}

export function clientRateLimitKey(request: Request, scope: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const host = request.headers.get("host") ?? "unknown-host";
  return `${scope}:${forwardedFor || realIp || host}`;
}

export function checkRateLimit(key: string, maxRequests = API_MAX_REQUESTS, windowMs = API_WINDOW_MS): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

function jsonError(message: string, status: number): NextResponse {
  return applySecurityHeaders(NextResponse.json({ error: message }, { status }));
}

export function enforceApiRequestSecurity(request: Request): NextResponse | null {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > API_MAX_BODY_BYTES) {
    return jsonError("Request body is too large.", 413);
  }

  const maxRequests = isMutationMethod(method) ? API_MAX_MUTATIONS : API_MAX_REQUESTS;
  if (!checkRateLimit(clientRateLimitKey(request, isMutationMethod(method) ? "api-write" : "api-read"), maxRequests)) {
    return jsonError("Too many requests. Please wait before retrying.", 429);
  }

  if (!isMutationMethod(method)) {
    return null;
  }

  if (url.pathname === "/api/alerts/worker" && isAuthorizedWorkerRequest(request)) {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  const hasTrustedOrigin = isTrustedOrigin(origin, url.origin);
  const hasTrustedReferer = referer ? referer.startsWith(`${url.origin}/`) || Array.from(localOrigins).some((item) => referer.startsWith(`${item}/`)) : false;
  const browserSaysSameSite = fetchSite === "same-origin" || fetchSite === "same-site";

  if (!hasTrustedOrigin && !hasTrustedReferer && !browserSaysSameSite) {
    return jsonError("Cross-site mutation requests are blocked.", 403);
  }

  return null;
}
