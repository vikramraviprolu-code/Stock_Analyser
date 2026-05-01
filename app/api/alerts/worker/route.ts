import { NextResponse } from "next/server";
import { parseBooleanFlag } from "@/src/lib/api-validation";
import { buildAlertSchedulerStatus, evaluateAlertWorkspace } from "@/src/lib/alert-engine";
import { configuredWorkerSecret, isAuthorizedWorkerRequest, workerSecretStatus } from "@/src/lib/security";
import { listAlerts, listWorkspaceOwnerIds } from "@/src/lib/workspace-store";
import type { AlertWorkerOwnerResult, AlertWorkerResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OWNER_SCAN = 500;

function unauthorizedResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseForceFlag(value: unknown) {
  if (typeof value === "boolean") {
    return { ok: true as const, value };
  }
  return parseBooleanFlag(value === undefined || value === null ? null : String(value), "force");
}

export async function GET() {
  const secret = workerSecretStatus();
  return NextResponse.json({
    mode: "hosted-alert-worker",
    retrievedAt: new Date().toISOString(),
    configured: secret.configured,
    endpoint: "/api/alerts/worker",
    auth: "bearer-secret",
    minSecretLength: secret.minLength,
    warning: secret.warning,
    status: {
      label: "Hosted alert worker",
      status: secret.configured ? "ok" : "warning",
      detail: secret.configured
        ? "Hosted worker endpoint is configured. Use a scheduler to POST with Authorization: Bearer <secret>."
        : "Set STOCK_ANALYSER_WORKER_SECRET to enable hosted scheduled alert checks.",
      url: null
    }
  });
}

export async function POST(request: Request) {
  if (!configuredWorkerSecret()) {
    return unauthorizedResponse(503, "Hosted alert worker is disabled until STOCK_ANALYSER_WORKER_SECRET is configured with at least 32 characters.");
  }
  if (!isAuthorizedWorkerRequest(request)) {
    return unauthorizedResponse(401, "Invalid hosted alert worker credentials.");
  }

  const payload = (await request.json().catch(() => ({}))) as { force?: unknown };
  const forceResult = parseForceFlag(payload.force);
  if (!forceResult.ok) {
    return NextResponse.json({ error: forceResult.message }, { status: forceResult.status });
  }

  const owners = (await listWorkspaceOwnerIds()).slice(0, MAX_OWNER_SCAN);
  const ownerResults: AlertWorkerOwnerResult[] = [];

  for (const ownerId of owners) {
    try {
      const evaluated = await evaluateAlertWorkspace(ownerId, "scheduled", forceResult.value);
      ownerResults.push({
        ownerId,
        rulesChecked: evaluated.run.rulesChecked,
        eventsCreated: evaluated.run.eventsCreated,
        notificationsCreated: evaluated.run.notificationsCreated,
        warnings: evaluated.warnings,
        status: evaluated.warnings.length > 0 ? "warning" : "ok"
      });
    } catch (error) {
      ownerResults.push({
        ownerId,
        rulesChecked: 0,
        eventsCreated: 0,
        notificationsCreated: 0,
        warnings: [error instanceof Error ? error.message : "Scheduled worker evaluation failed."],
        status: "error"
      });
    }
  }

  const totals = ownerResults.reduce(
    (acc, result) => ({
      rulesChecked: acc.rulesChecked + result.rulesChecked,
      eventsCreated: acc.eventsCreated + result.eventsCreated,
      notificationsCreated: acc.notificationsCreated + result.notificationsCreated,
      warnings: acc.warnings + result.warnings.length
    }),
    { rulesChecked: 0, eventsCreated: 0, notificationsCreated: 0, warnings: 0 }
  );
  const hasErrors = ownerResults.some((result) => result.status === "error");
  const hasWarnings = totals.warnings > 0 || owners.length >= MAX_OWNER_SCAN;
  const response: AlertWorkerResponse = {
    mode: "hosted-alert-worker",
    retrievedAt: new Date().toISOString(),
    force: forceResult.value,
    ownersScanned: owners.length,
    totals,
    ownerResults,
    status: {
      label: "Hosted alert worker",
      status: hasErrors ? "error" : hasWarnings ? "warning" : "ok",
      detail:
        owners.length >= MAX_OWNER_SCAN
          ? `Worker scanned the first ${MAX_OWNER_SCAN} workspace owners. Move to a managed job queue before larger hosted scale.`
          : "Hosted worker completed scheduled alert checks for discovered local workspace owners.",
      url: null
    }
  };

  if (owners.length === 0) {
    const emptyWorkspace = await listAlerts();
    response.status.detail = buildAlertSchedulerStatus(emptyWorkspace).detail;
  }

  return NextResponse.json(response);
}
