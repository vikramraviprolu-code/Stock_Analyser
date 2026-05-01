import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionParam, parseTickerQuery } from "@/src/lib/api-validation";
import { ALERT_METRICS, ALERT_OPERATORS, buildAlertSchedulerStatus, evaluateAlertWorkspace } from "@/src/lib/alert-engine";
import { workspaceOwnerId } from "@/src/lib/auth";
import { listAlerts, removeAlertRule, upsertAlertRule } from "@/src/lib/workspace-store";
import type { AlertMetric, AlertOperator, AlertSchedule, AlertsResponse, AlertWorkspaceState } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_SCHEDULES: AlertSchedule[] = ["manual", "hourly", "daily"];

function responseFromWorkspace(workspace: AlertWorkspaceState, warnings: string[]): AlertsResponse {
  return {
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    rules: workspace.rules,
    events: workspace.events,
    notifications: workspace.notifications,
    schedulerRuns: workspace.schedulerRuns,
    scheduler: buildAlertSchedulerStatus(workspace),
    warnings,
    status: {
      label: "Alert sync",
      status: "ok",
      detail: "Alert rules are stored through the Stock Analyser server workspace store. Scheduled checks run locally while the app page is active; hosted workers are still needed for always-on delivery.",
      url: null
    }
  };
}

async function buildResponse(evaluate: boolean, ownerId: string): Promise<AlertsResponse> {
  if (evaluate) {
    const evaluated = await evaluateAlertWorkspace(ownerId, "manual", true);
    return responseFromWorkspace(evaluated.workspace, evaluated.warnings);
  }

  return responseFromWorkspace(await listAlerts(ownerId), []);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const evaluateResult = parseBooleanFlag(searchParams.get("evaluate"), "evaluate");
  if (!evaluateResult.ok) {
    return NextResponse.json({ error: evaluateResult.message }, { status: evaluateResult.status });
  }
  return NextResponse.json(await buildResponse(evaluateResult.value, await workspaceOwnerId(request)));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    id?: string | null;
    ticker?: string;
    region?: string;
    metric?: AlertMetric;
    operator?: AlertOperator;
    threshold?: number;
    enabled?: boolean;
    schedule?: AlertSchedule;
  };
  const tickerResult = parseTickerQuery(payload.ticker ?? null, "ticker");
  if (!tickerResult.ok) return NextResponse.json({ error: tickerResult.message }, { status: tickerResult.status });
  const regionResult = parseRegionParam(payload.region ?? null, tickerResult.value);
  if (!regionResult.ok) return NextResponse.json({ error: regionResult.message }, { status: regionResult.status });
  if (!payload.metric || !ALERT_METRICS.includes(payload.metric)) {
    return NextResponse.json({ error: "Unsupported alert metric." }, { status: 400 });
  }
  if (!payload.operator || !ALERT_OPERATORS.includes(payload.operator)) {
    return NextResponse.json({ error: "Unsupported alert operator." }, { status: 400 });
  }
  if (!Number.isFinite(payload.threshold)) {
    return NextResponse.json({ error: "Alert threshold must be a number." }, { status: 400 });
  }
  const schedule = payload.schedule ?? "hourly";
  if (!ALERT_SCHEDULES.includes(schedule)) {
    return NextResponse.json({ error: "Alert schedule must be manual, hourly, or daily." }, { status: 400 });
  }

  const ownerId = await workspaceOwnerId(request);
  await upsertAlertRule({
    id: payload.id,
    ticker: tickerResult.value,
    region: regionResult.value,
    metric: payload.metric,
    operator: payload.operator,
    threshold: Number(payload.threshold),
    enabled: payload.enabled ?? true,
    schedule
  }, ownerId);
  return NextResponse.json(await buildResponse(false, ownerId));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Alert id is required." }, { status: 400 });
  }
  const ownerId = await workspaceOwnerId(request);
  await removeAlertRule(id, ownerId);
  return NextResponse.json(await buildResponse(false, ownerId));
}
