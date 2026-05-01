import { NextResponse } from "next/server";
import { parseBooleanFlag } from "@/src/lib/api-validation";
import { buildAlertSchedulerStatus, evaluateAlertWorkspace } from "@/src/lib/alert-engine";
import { workspaceOwnerId } from "@/src/lib/auth";
import { listAlerts } from "@/src/lib/workspace-store";
import type { AlertSchedulerResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schedulerStatusDetail(): string {
  return "Local scheduled alerts run while the app page is active. This endpoint is provider-ready for a hosted scheduler when cloud infrastructure is connected.";
}

function parseForceFlag(value: unknown) {
  if (typeof value === "boolean") {
    return { ok: true as const, value };
  }
  return parseBooleanFlag(value === undefined || value === null ? null : String(value), "force");
}

export async function GET(request: Request) {
  const ownerId = await workspaceOwnerId(request);
  const workspace = await listAlerts(ownerId);
  return NextResponse.json({
    mode: "local-scheduled-alerts",
    retrievedAt: new Date().toISOString(),
    ownerId,
    scheduler: buildAlertSchedulerStatus(workspace),
    warnings: [],
    status: {
      label: "Alert scheduler",
      status: "ok",
      detail: schedulerStatusDetail(),
      url: null
    }
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { force?: unknown };
  const forceResult = parseForceFlag(payload.force);
  if (!forceResult.ok) {
    return NextResponse.json({ error: forceResult.message }, { status: forceResult.status });
  }

  const ownerId = await workspaceOwnerId(request);
  const evaluated = await evaluateAlertWorkspace(ownerId, "scheduled", forceResult.value);
  const response: AlertSchedulerResponse = {
    mode: "local-scheduled-alerts",
    retrievedAt: new Date().toISOString(),
    ownerId,
    run: evaluated.run,
    scheduler: buildAlertSchedulerStatus(evaluated.workspace),
    warnings: evaluated.warnings,
    status: {
      label: "Alert scheduler",
      status: evaluated.warnings.length > 0 ? "warning" : "ok",
      detail: schedulerStatusDetail(),
      url: null
    }
  };
  return NextResponse.json(response);
}
