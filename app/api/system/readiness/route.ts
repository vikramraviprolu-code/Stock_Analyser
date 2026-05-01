import { NextResponse } from "next/server";
import { workerSecretStatus } from "@/src/lib/security";
import type { DeploymentReadinessResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cloudSyncConfigured(): boolean {
  const provider = process.env.STOCK_ANALYSER_WORKSPACE_PROVIDER?.trim().toLowerCase();
  const databaseUrl = process.env.STOCK_ANALYSER_DATABASE_URL?.trim();
  return provider === "cloud" && Boolean(databaseUrl);
}

export async function GET() {
  const workerSecret = workerSecretStatus();
  const cloudReady = cloudSyncConfigured();
  const warnings = [
    ...(cloudReady ? [] : ["Cloud sync is not connected yet. Local encrypted JSON remains the active workspace store."]),
    ...(workerSecret.warning ? [workerSecret.warning] : [])
  ];
  const response: DeploymentReadinessResponse = {
    mode: "deployment-readiness",
    retrievedAt: new Date().toISOString(),
    cloudSync: {
      configured: cloudReady,
      provider: cloudReady ? "cloud" : "local-encrypted-json",
      requiredEnv: ["STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud", "STOCK_ANALYSER_DATABASE_URL"],
      detail: cloudReady
        ? "Cloud workspace provider flags are present. Verify managed encryption, row-level access control, backups, and data-processing terms before launch."
        : "The app is still using the local encrypted workspace adapter. This is suitable for local development, not hosted multi-user sync."
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
