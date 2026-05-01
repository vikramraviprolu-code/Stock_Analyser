import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  contentSecurityPolicy,
  enforceApiRequestSecurity,
  isAuthorizedWorkerRequest,
  isTrustedOrigin,
  workerSecretStatus
} from "../src/lib/security";

describe("security controls", () => {
  it("emits a restrictive baseline content security policy", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("trusts only current or configured local origins", () => {
    expect(isTrustedOrigin("http://127.0.0.1:3000", "http://127.0.0.1:3000")).toBe(true);
    expect(isTrustedOrigin("https://stockanalyser.app:3443", "http://127.0.0.1:3000")).toBe(true);
    expect(isTrustedOrigin("https://evil.example", "http://127.0.0.1:3000")).toBe(false);
    expect(isTrustedOrigin(null, "http://127.0.0.1:3000")).toBe(false);
  });

  it("rate limits by key and window", () => {
    const key = `unit-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it("blocks mutation requests without a trusted browser origin", () => {
    const request = new Request("http://127.0.0.1:3000/api/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "none"
      }
    });

    expect(enforceApiRequestSecurity(request)?.status).toBe(403);
  });

  it("allows same-origin mutation requests", () => {
    const request = new Request("http://127.0.0.1:3000/api/workspace", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000"
      }
    });

    expect(enforceApiRequestSecurity(request)).toBeNull();
  });

  it("allows hosted worker mutations only with a configured bearer secret", () => {
    const previousSecret = process.env.STOCK_ANALYSER_WORKER_SECRET;
    const secret = "unit-test-worker-secret-32-characters";
    process.env.STOCK_ANALYSER_WORKER_SECRET = secret;
    try {
      const authorized = new Request("http://127.0.0.1:3000/api/alerts/worker", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json"
        }
      });
      const unauthorized = new Request("http://127.0.0.1:3000/api/alerts/worker", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-secret",
          "content-type": "application/json"
        }
      });

      expect(workerSecretStatus().configured).toBe(true);
      expect(isAuthorizedWorkerRequest(authorized)).toBe(true);
      expect(enforceApiRequestSecurity(authorized)).toBeNull();
      expect(isAuthorizedWorkerRequest(unauthorized)).toBe(false);
      expect(enforceApiRequestSecurity(unauthorized)?.status).toBe(403);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.STOCK_ANALYSER_WORKER_SECRET;
      } else {
        process.env.STOCK_ANALYSER_WORKER_SECRET = previousSecret;
      }
    }
  });

  it("treats weak hosted worker secrets as not configured", () => {
    const previousSecret = process.env.STOCK_ANALYSER_WORKER_SECRET;
    process.env.STOCK_ANALYSER_WORKER_SECRET = "too-short";
    try {
      expect(workerSecretStatus().configured).toBe(false);
      expect(workerSecretStatus().warning).toContain("at least 32 characters");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.STOCK_ANALYSER_WORKER_SECRET;
      } else {
        process.env.STOCK_ANALYSER_WORKER_SECRET = previousSecret;
      }
    }
  });
});
