import { NextResponse } from "next/server";
import { cloudWorkspaceReadiness } from "@/src/lib/cloud-workspace";
import { workerSecretStatus } from "@/src/lib/security";
import type { DeploymentReadinessResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const workerSecret = workerSecretStatus();
  const cloud = cloudWorkspaceReadiness();
  const warnings = [
    ...cloud.warnings,
    ...(workerSecret.warning ? [workerSecret.warning] : [])
  ];
  const response: DeploymentReadinessResponse = {
    mode: "deployment-readiness",
    retrievedAt: new Date().toISOString(),
    cloudSync: {
      configured: cloud.configured,
      provider: cloud.provider,
      driver: cloud.driver,
      schemaVersion: cloud.schemaVersion,
      migrationPath: cloud.migrationPath,
      requiredEnv: cloud.requiredEnv,
      missingEnv: cloud.missingEnv,
      sanitizedDatabaseUrl: cloud.sanitizedDatabaseUrl,
      detail: cloud.detail,
      warnings: cloud.warnings
    },
    hostedWorker: {
      configured: workerSecret.configured,
      endpoint: "/api/alerts/worker",
      auth: "bearer-secret",
      minSecretLength: workerSecret.minLength,
      detail: workerSecret.configured
        ? "Hosted alert worker endpoint is armed for authenticated scheduler calls."
        : "Set STOCK_ANALYSER_WORKER_SECRET before configuring an external scheduler.",
      warning: workerSecret.warning
    },
    security: {
      cspEnabled: true,
      csrfProtection: true,
      rateLimiting: true,
      apiNoStore: true,
      strictTransportSecurity: true
    },
    gdpr: {
      exportEnabled: true,
      deleteEnabled: true,
      consentHistory: true,
      auditTrail: true
    },
    warnings,
    status: {
      label: "Production readiness",
      status: warnings.length === 0 ? "ok" : "warning",
      detail: warnings.length === 0
        ? "Cloud sync and hosted worker readiness checks are configured."
        : "Some production readiness checks still need configuration before hosted launch.",
      url: null
    }
  };

  return NextResponse.json(response);
}
