import { randomUUID } from "node:crypto";
import { fetchHistory } from "./history";
import { listAlerts, replaceAlerts } from "./workspace-store";
import type {
  AlertEvent,
  AlertMetric,
  AlertNotification,
  AlertOperator,
  AlertRule,
  AlertSchedulerRun,
  AlertSchedulerStatus,
  AlertWorkspaceState,
  HistoryMetrics
} from "./types";

export const ALERT_METRICS: AlertMetric[] = ["price", "rsi14", "percentFromLow", "performance5D"];
export const ALERT_OPERATORS: AlertOperator[] = ["above", "below"];

const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const EVENT_LIMIT = 100;
const NOTIFICATION_LIMIT = 120;
const SCHEDULER_RUN_LIMIT = 50;
const DEFAULT_SCHEDULER_INTERVAL_MINUTES = 15;

export function metricValue(metric: AlertMetric, metrics: HistoryMetrics): number | null {
  if (metric === "price") return metrics.latestClose;
  return metrics[metric];
}

export function alertMetricLabel(metric: AlertMetric): string {
  if (metric === "price") return "latest close";
  if (metric === "rsi14") return "RSI 14D";
  if (metric === "percentFromLow") return "% from 52-week low";
  return "5D performance";
}

export function alertTriggered(rule: AlertRule, actual: number | null): boolean {
  if (actual === null) return false;
  return rule.operator === "above" ? actual >= rule.threshold : actual <= rule.threshold;
}

export function nextEvaluationAt(rule: Pick<AlertRule, "schedule">, from = new Date()): string | null {
  if (rule.schedule === "manual") {
    return null;
  }
  const intervalMs = rule.schedule === "daily" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(from.getTime() + intervalMs).toISOString();
}

export function isRuleDue(rule: AlertRule, now = new Date()): boolean {
  if (!rule.enabled || rule.schedule === "manual") {
    return false;
  }
  if (!rule.nextEvaluationAt) {
    return true;
  }
  const dueAt = new Date(rule.nextEvaluationAt).getTime();
  return !Number.isFinite(dueAt) || dueAt <= now.getTime();
}

function lastRunAt(workspace: AlertWorkspaceState): string | null {
  return workspace.schedulerRuns[0]?.finishedAt ?? null;
}

function soonestNextRunAt(workspace: AlertWorkspaceState): string | null {
  const dueTimes = workspace.rules
    .filter((rule) => rule.enabled && rule.schedule !== "manual" && rule.nextEvaluationAt)
    .map((rule) => new Date(rule.nextEvaluationAt as string).getTime())
    .filter(Number.isFinite);
  if (dueTimes.length === 0) {
    return null;
  }
  return new Date(Math.min(...dueTimes)).toISOString();
}

export function buildAlertSchedulerStatus(workspace: AlertWorkspaceState, now = new Date()): AlertSchedulerStatus {
  const scheduledRules = workspace.rules.filter((rule) => rule.enabled && rule.schedule !== "manual");
  return {
    enabled: scheduledRules.length > 0,
    localOnly: true,
    activeWhilePageOpen: true,
    intervalMinutes: DEFAULT_SCHEDULER_INTERVAL_MINUTES,
    lastRunAt: lastRunAt(workspace),
    nextRunAt: soonestNextRunAt(workspace),
    dueRules: scheduledRules.filter((rule) => isRuleDue(rule, now)).length,
    detail:
      scheduledRules.length > 0
        ? "Local scheduled checks run while the app page is active. Hosted background workers are still required for always-on delivery."
        : "No scheduled alert rules are enabled. Add hourly or daily alerts to activate local scheduled checks."
  };
}

function createNotification(event: AlertEvent): AlertNotification {
  const deliveredAt = new Date().toISOString();
  return {
    id: randomUUID(),
    eventId: event.id,
    ruleId: event.ruleId,
    ticker: event.ticker,
    title: `${event.ticker} alert triggered`,
    message: event.message,
    status: "delivered",
    createdAt: deliveredAt,
    deliveredAt,
    readAt: null
  };
}

function updateRuleEvaluation(rule: AlertRule, evaluatedAt: Date): AlertRule {
  return {
    ...rule,
    lastEvaluatedAt: evaluatedAt.toISOString(),
    nextEvaluationAt: nextEvaluationAt(rule, evaluatedAt),
    updatedAt: evaluatedAt.toISOString()
  };
}

export async function evaluateAlertWorkspace(
  ownerId: string,
  trigger: AlertSchedulerRun["trigger"],
  force = false
): Promise<{ workspace: AlertWorkspaceState; run: AlertSchedulerRun; warnings: string[] }> {
  const startedAt = new Date();
  const workspace = await listAlerts(ownerId);
  const warnings: string[] = [];
  const nextRules = [...workspace.rules];
  const nextEvents = [...workspace.events];
  const nextNotifications = [...workspace.notifications];
  const rulesToCheck = workspace.rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (trigger === "manual") return true;
    if (rule.schedule === "manual") return false;
    return force || isRuleDue(rule, startedAt);
  });
  let eventsCreated = 0;
  let notificationsCreated = 0;

  for (const rule of rulesToCheck) {
    const ruleIndex = nextRules.findIndex((item) => item.id === rule.id);
    const evaluatedRule = updateRuleEvaluation(rule, new Date());
    if (ruleIndex >= 0) {
      nextRules[ruleIndex] = evaluatedRule;
    }

    try {
      const history = await fetchHistory(rule.ticker, rule.region, false);
      const actual = metricValue(rule.metric, history.metrics);
      if (!alertTriggered(rule, actual)) {
        continue;
      }

      const lastTriggered = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
      if (Number.isFinite(lastTriggered) && Date.now() - lastTriggered < ALERT_COOLDOWN_MS) {
        continue;
      }

      const triggeredAt = new Date().toISOString();
      const event: AlertEvent = {
        id: randomUUID(),
        ruleId: rule.id,
        ticker: rule.ticker,
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        actual,
        triggeredAt,
        message: `${rule.ticker} ${alertMetricLabel(rule.metric)} is ${rule.operator} ${rule.threshold}.`
      };
      nextEvents.unshift(event);
      nextNotifications.unshift(createNotification(event));
      eventsCreated += 1;
      notificationsCreated += 1;
      if (ruleIndex >= 0) {
        nextRules[ruleIndex] = { ...nextRules[ruleIndex], lastTriggeredAt: triggeredAt, updatedAt: triggeredAt };
      }
    } catch (error) {
      warnings.push(error instanceof Error ? `${rule.ticker}: ${error.message}` : `${rule.ticker}: Alert evaluation failed.`);
    }
  }

  const finishedAt = new Date().toISOString();
  const run: AlertSchedulerRun = {
    id: randomUUID(),
    trigger,
    startedAt: startedAt.toISOString(),
    finishedAt,
    rulesChecked: rulesToCheck.length,
    eventsCreated,
    notificationsCreated,
    warnings
  };

  const nextWorkspace: AlertWorkspaceState = {
    rules: nextRules,
    events: nextEvents.slice(0, EVENT_LIMIT),
    notifications: nextNotifications.slice(0, NOTIFICATION_LIMIT),
    schedulerRuns: [run, ...workspace.schedulerRuns].slice(0, SCHEDULER_RUN_LIMIT)
  };
  await replaceAlerts(nextWorkspace, ownerId);
  return { workspace: nextWorkspace, run, warnings };
}
