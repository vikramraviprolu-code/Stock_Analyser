import { describe, expect, it } from "vitest";
import { cloudWorkspaceReadiness, databaseDriverForUrl, sanitizeDatabaseUrl } from "../src/lib/cloud-workspace";

describe("cloud workspace readiness", () => {
  it("stays local when cloud env vars are missing", () => {
    const readiness = cloudWorkspaceReadiness({});
    expect(readiness.configured).toBe(false);
    expect(readiness.provider).toBe("local-encrypted-json");
    expect(readiness.missingEnv).toContain("STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud");
    expect(readiness.missingEnv).toContain("STOCK_ANALYSER_DATABASE_URL");
  });

  it("accepts postgres database urls and redacts credentials", () => {
    const readiness = cloudWorkspaceReadiness({
      STOCK_ANALYSER_WORKSPACE_PROVIDER: "cloud",
      STOCK_ANALYSER_DATABASE_URL: "postgres://actual-user:super-secret@example.com:5432/stock_analyser?sslmode=require"
    });

    expect(readiness.configured).toBe(true);
    expect(readiness.provider).toBe("cloud");
    expect(readiness.driver).toBe("postgres");
    expect(readiness.sanitizedDatabaseUrl).toBe("postgres://user:redacted@example.com:5432/stock_analyser");
    expect(readiness.warnings).toEqual([]);
  });

  it("rejects unsupported database url protocols", () => {
    const readiness = cloudWorkspaceReadiness({
      STOCK_ANALYSER_WORKSPACE_PROVIDER: "cloud",
      STOCK_ANALYSER_DATABASE_URL: "mysql://user:secret@example.com/stock_analyser"
    });

    expect(readiness.configured).toBe(false);
    expect(readiness.driver).toBe("unknown");
    expect(readiness.warnings).toContain("STOCK_ANALYSER_DATABASE_URL must use a postgres:// or postgresql:// URL.");
  });

  it("sanitizes invalid and empty urls without throwing", () => {
    expect(databaseDriverForUrl("not-a-url")).toBe("unknown");
    expect(sanitizeDatabaseUrl("not-a-url")).toBe("invalid-url");
    expect(sanitizeDatabaseUrl(undefined)).toBeNull();
  });
});
