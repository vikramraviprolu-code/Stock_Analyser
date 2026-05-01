import { describe, expect, it } from "vitest";
import { alertTriggered, buildAlertSchedulerStatus, isRuleDue, nextEvaluationAt } from "../src/lib/alert-engine";
import type { AlertRule } from "../src/lib/types";

const baseDate = "2026-05-01T10:00:00.000Z";

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    ticker: "AAPL",
    region: "USA",
    metric: "price",
    operator: "above",
    threshold: 100,
    enabled: true,
    createdAt: baseDate,
    updatedAt: baseDate,
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    nextEvaluationAt: "2026-05-01T11:00:00.000Z",
    schedule: "hourly",
    ...overrides
  };
}

describe("alert engine", () => {
  it("calculates next evaluation timestamps by schedule", () => {
    const from = new Date(baseDate);
    expect(nextEvaluationAt({ schedule: "hourly" }, from)).toBe("2026-05-01T11:00:00.000Z");
    expect(nextEvaluationAt({ schedule: "daily" }, from)).toBe("2026-05-02T10:00:00.000Z");
    expect(nextEvaluationAt({ schedule: "manual" }, from)).toBeNull();
  });

  it("detects due scheduled rules without running disabled or manual rules", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    expect(isRuleDue(rule(), now)).toBe(true);
    expect(isRuleDue(rule({ nextEvaluationAt: "2026-05-01T13:00:00.000Z" }), now)).toBe(false);
    expect(isRuleDue(rule({ nextEvaluationAt: null }), now)).toBe(true);
    expect(isRuleDue(rule({ enabled: false }), now)).toBe(false);
    expect(isRuleDue(rule({ schedule: "manual", nextEvaluationAt: null }), now)).toBe(false);
  });

  it("evaluates alert thresholds for above and below operators", () => {
    expect(alertTriggered(rule({ operator: "above", threshold: 100 }), 101)).toBe(true);
    expect(alertTriggered(rule({ operator: "above", threshold: 100 }), 99)).toBe(false);
    expect(alertTriggered(rule({ operator: "below", threshold: 100 }), 99)).toBe(true);
    expect(alertTriggered(rule({ operator: "below", threshold: 100 }), 101)).toBe(false);
    expect(alertTriggered(rule(), null)).toBe(false);
  });

  it("summarizes local scheduler status from the workspace", () => {
    const status = buildAlertSchedulerStatus({
      rules: [
        rule({ id: "due", nextEvaluationAt: "2026-05-01T09:00:00.000Z" }),
        rule({ id: "future", nextEvaluationAt: "2026-05-01T13:00:00.000Z" }),
        rule({ id: "manual", schedule: "manual", nextEvaluationAt: null })
      ],
      events: [],
      notifications: [],
      schedulerRuns: [
        {
          id: "run-1",
          trigger: "scheduled",
          startedAt: "2026-05-01T08:59:00.000Z",
          finishedAt: "2026-05-01T09:00:00.000Z",
          rulesChecked: 1,
          eventsCreated: 0,
          notificationsCreated: 0,
          warnings: []
        }
      ]
    }, new Date("2026-05-01T12:00:00.000Z"));

    expect(status.enabled).toBe(true);
    expect(status.activeWhilePageOpen).toBe(true);
    expect(status.dueRules).toBe(1);
    expect(status.lastRunAt).toBe("2026-05-01T09:00:00.000Z");
    expect(status.nextRunAt).toBe("2026-05-01T09:00:00.000Z");
  });
});
