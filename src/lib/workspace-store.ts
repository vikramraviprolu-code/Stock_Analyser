import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AlertEvent,
  AlertMetric,
  AlertNotification,
  AlertOperator,
  AlertRule,
  AlertSchedulerRun,
  AlertWorkspaceState,
  PrivacyConsent,
  PrivacyConsentRecord,
  PortfolioHolding,
  Region,
  WorkspaceAuditEvent,
  WorkspaceExportResponse,
  WatchlistItem
} from "./types";
import { decryptJson, encryptJson, generateWorkspaceSecret, type EncryptedJsonEnvelope } from "./workspace-crypto";

interface WorkspaceState {
  watchlist: WatchlistItem[];
  portfolio: PortfolioHolding[];
  alerts: {
    rules: AlertRule[];
    events: AlertEvent[];
    notifications: AlertNotification[];
    schedulerRuns: AlertSchedulerRun[];
  };
  privacy: {
    consent: PrivacyConsent;
    consentHistory: PrivacyConsentRecord[];
  };
  auditEvents: WorkspaceAuditEvent[];
  updatedAt: string;
}

const STORE_DIR = process.env.STOCK_ANALYSER_DATA_DIR?.trim() || ".stock-analyser-data";
const WORKSPACES_DIR = join(STORE_DIR, "workspaces");
const LEGACY_PLAINTEXT_STORE_PATH = join(STORE_DIR, "workspace.json");
const LEGACY_SECURE_STORE_PATH = join(STORE_DIR, "workspace.secure.json");
const KEY_PATH = join(STORE_DIR, ".workspace-key");
const DEFAULT_WORKSPACE_OWNER_ID = "anonymous:local-default";
const AUDIT_LIMIT = 100;
const CONSENT_HISTORY_LIMIT = 50;
const RETENTION_DAYS = 365;
const plaintextMigrationsThisRuntime = new Set<string>();

const DEFAULT_STATE: WorkspaceState = {
  watchlist: [],
  portfolio: [],
  alerts: {
    rules: [],
    events: [],
    notifications: [],
    schedulerRuns: []
  },
  privacy: {
    consent: {
      analytics: false,
      emailBriefs: false,
      productUpdates: false,
      updatedAt: new Date(0).toISOString()
    },
    consentHistory: []
  },
  auditEvents: [],
  updatedAt: new Date(0).toISOString()
};

function normalizeState(parsed: Partial<WorkspaceState>): WorkspaceState {
  return {
    watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
    portfolio: Array.isArray(parsed.portfolio) ? parsed.portfolio : [],
    alerts: {
      rules: Array.isArray(parsed.alerts?.rules) ? parsed.alerts.rules.map(normalizeAlertRule) : [],
      events: Array.isArray(parsed.alerts?.events) ? parsed.alerts.events : [],
      notifications: Array.isArray(parsed.alerts?.notifications) ? parsed.alerts.notifications : [],
      schedulerRuns: Array.isArray(parsed.alerts?.schedulerRuns) ? parsed.alerts.schedulerRuns : []
    },
    privacy: {
      consent: {
        analytics: parsed.privacy?.consent?.analytics === true,
        emailBriefs: parsed.privacy?.consent?.emailBriefs === true,
        productUpdates: parsed.privacy?.consent?.productUpdates === true,
        updatedAt: typeof parsed.privacy?.consent?.updatedAt === "string" ? parsed.privacy.consent.updatedAt : new Date(0).toISOString()
      },
      consentHistory: Array.isArray(parsed.privacy?.consentHistory)
        ? parsed.privacy.consentHistory.slice(0, CONSENT_HISTORY_LIMIT)
        : []
    },
    auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents.slice(0, AUDIT_LIMIT) : [],
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
  };
}

function nextEvaluationFrom(baseIso: string, schedule: AlertRule["schedule"]): string | null {
  if (schedule === "manual") {
    return null;
  }
  const base = new Date(baseIso).getTime();
  const intervalMs = schedule === "daily" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date((Number.isFinite(base) ? base : Date.now()) + intervalMs).toISOString();
}

function normalizeAlertRule(rule: AlertRule): AlertRule {
  const schedule = rule.schedule ?? "hourly";
  const createdAt = typeof rule.createdAt === "string" ? rule.createdAt : new Date().toISOString();
  return {
    ...rule,
    enabled: rule.enabled !== false,
    createdAt,
    updatedAt: typeof rule.updatedAt === "string" ? rule.updatedAt : createdAt,
    lastTriggeredAt: typeof rule.lastTriggeredAt === "string" ? rule.lastTriggeredAt : null,
    lastEvaluatedAt: typeof rule.lastEvaluatedAt === "string" ? rule.lastEvaluatedAt : null,
    nextEvaluationAt:
      typeof rule.nextEvaluationAt === "string"
        ? rule.nextEvaluationAt
        : nextEvaluationFrom(createdAt, schedule),
    schedule
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

export function normalizeWorkspaceOwnerId(ownerId: string | null | undefined): string {
  const value = ownerId?.trim() || DEFAULT_WORKSPACE_OWNER_ID;
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 96) || DEFAULT_WORKSPACE_OWNER_ID;
}

export async function listWorkspaceOwnerIds(): Promise<string[]> {
  const owners = new Set<string>();
  try {
    const entries = await readdir(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        owners.add(normalizeWorkspaceOwnerId(entry.name));
      }
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  for (const path of [LEGACY_SECURE_STORE_PATH, LEGACY_PLAINTEXT_STORE_PATH]) {
    try {
      await readFile(path, "utf-8");
      owners.add(DEFAULT_WORKSPACE_OWNER_ID);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }

  return [...owners].sort();
}

function ownerStoreDir(ownerId: string | null | undefined): string {
  return join(WORKSPACES_DIR, normalizeWorkspaceOwnerId(ownerId));
}

function plaintextStorePath(ownerId: string | null | undefined): string {
  return join(ownerStoreDir(ownerId), "workspace.json");
}

function secureStorePath(ownerId: string | null | undefined): string {
  return join(ownerStoreDir(ownerId), "workspace.secure.json");
}

function isDefaultOwner(ownerId: string | null | undefined): boolean {
  return normalizeWorkspaceOwnerId(ownerId) === DEFAULT_WORKSPACE_OWNER_ID;
}

async function workspaceSecret(): Promise<{ secret: string; keyManagement: WorkspaceExportResponse["storage"]["keyManagement"] }> {
  const environmentSecret = process.env.STOCK_ANALYSER_WORKSPACE_KEY;
  if (environmentSecret?.trim()) {
    return { secret: environmentSecret, keyManagement: "environment-secret" };
  }

  try {
    return { secret: (await readFile(KEY_PATH, "utf-8")).trim(), keyManagement: "local-0600-key-file" };
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const secret = generateWorkspaceSecret();
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(KEY_PATH, `${secret}\n`, { encoding: "utf-8", mode: 0o600 });
  return { secret, keyManagement: "local-0600-key-file" };
}

async function readEncryptedState(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WorkspaceState | null> {
  let raw: string;
  let loadedLegacy = false;
  try {
    raw = await readFile(secureStorePath(ownerId), "utf-8");
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    if (!isDefaultOwner(ownerId)) {
      return null;
    }
    try {
      raw = await readFile(LEGACY_SECURE_STORE_PATH, "utf-8");
      loadedLegacy = true;
    } catch (legacyError) {
      if (isMissingFile(legacyError)) {
        return null;
      }
      throw legacyError;
    }
  }

  const { secret } = await workspaceSecret();
  const state = normalizeState(decryptJson<WorkspaceState>(JSON.parse(raw) as EncryptedJsonEnvelope, secret));
  if (loadedLegacy) {
    await writeEncryptedState(state, ownerId);
  }
  return state;
}

async function readPlaintextState(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WorkspaceState | null> {
  try {
    const raw = await readFile(plaintextStorePath(ownerId), "utf-8");
    return normalizeState(JSON.parse(raw) as Partial<WorkspaceState>);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
    if (!isDefaultOwner(ownerId)) {
      return null;
    }
    try {
      const raw = await readFile(LEGACY_PLAINTEXT_STORE_PATH, "utf-8");
      return normalizeState(JSON.parse(raw) as Partial<WorkspaceState>);
    } catch (legacyError) {
      if (isMissingFile(legacyError)) {
        return null;
      }
      throw legacyError;
    }
  }
}

async function writeEncryptedState(state: WorkspaceState, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<void> {
  const { secret } = await workspaceSecret();
  const normalizedOwner = normalizeWorkspaceOwnerId(ownerId);
  await mkdir(ownerStoreDir(normalizedOwner), { recursive: true });
  await writeFile(secureStorePath(normalizedOwner), `${JSON.stringify(encryptJson(state, secret), null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  for (const path of [
    plaintextStorePath(normalizedOwner),
    ...(isDefaultOwner(normalizedOwner) ? [LEGACY_PLAINTEXT_STORE_PATH] : [])
  ]) {
    try {
      await unlink(path);
      plaintextMigrationsThisRuntime.add(normalizedOwner);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }
}

async function readState(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WorkspaceState> {
  const normalizedOwner = normalizeWorkspaceOwnerId(ownerId);
  const encrypted = await readEncryptedState(normalizedOwner);
  if (encrypted) {
    return encrypted;
  }

  const plaintext = await readPlaintextState(normalizedOwner);
  if (plaintext) {
    const migrationEvent: WorkspaceAuditEvent = {
      id: randomUUID(),
      category: "system",
      action: "workspace_encrypted",
      detail: "Migrated local workspace data from plaintext JSON to encrypted JSON storage.",
      createdAt: new Date().toISOString()
    };
    const migratedState = {
      ...plaintext,
      auditEvents: [
        migrationEvent,
        ...plaintext.auditEvents
      ].slice(0, AUDIT_LIMIT)
    };
    await writeEncryptedState(migratedState, normalizedOwner);
    plaintextMigrationsThisRuntime.add(normalizedOwner);
    return migratedState;
  }

  return normalizeState(DEFAULT_STATE);
}

function auditEvent(category: WorkspaceAuditEvent["category"], action: string, detail: string): WorkspaceAuditEvent {
  return {
    id: randomUUID(),
    category,
    action,
    detail,
    createdAt: new Date().toISOString()
  };
}

async function writeState(
  state: WorkspaceState,
  audit?: Omit<WorkspaceAuditEvent, "id" | "createdAt">,
  ownerId = DEFAULT_WORKSPACE_OWNER_ID
): Promise<WorkspaceState> {
  const next: WorkspaceState = {
    ...state,
    auditEvents: audit
      ? [auditEvent(audit.category, audit.action, audit.detail), ...state.auditEvents].slice(0, AUDIT_LIMIT)
      : state.auditEvents.slice(0, AUDIT_LIMIT),
    updatedAt: new Date().toISOString()
  };
  await writeEncryptedState(next, ownerId);
  return next;
}

export async function listWatchlist(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WatchlistItem[]> {
  return (await readState(ownerId)).watchlist;
}

export async function upsertWatchlistItem(input: { ticker: string; region: Region }, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WatchlistItem[]> {
  const state = await readState(ownerId);
  const ticker = input.ticker.toUpperCase();
  const existing = state.watchlist.find((item) => item.ticker === ticker);
  const item: WatchlistItem = existing ?? {
    ticker,
    region: input.region,
    addedAt: new Date().toISOString()
  };
  const watchlist = [item, ...state.watchlist.filter((entry) => entry.ticker !== ticker)];
  return (await writeState({ ...state, watchlist }, {
    category: "watchlist",
    action: existing ? "watchlist_updated" : "watchlist_added",
    detail: `${ticker} saved to watchlist.`
  }, ownerId)).watchlist;
}

export async function removeWatchlistItem(ticker: string, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<WatchlistItem[]> {
  const state = await readState(ownerId);
  const normalizedTicker = ticker.toUpperCase();
  return (await writeState({
    ...state,
    watchlist: state.watchlist.filter((item) => item.ticker !== normalizedTicker)
  }, {
    category: "watchlist",
    action: "watchlist_removed",
    detail: `${normalizedTicker} removed from watchlist.`
  }, ownerId)).watchlist;
}

export async function listPortfolio(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<PortfolioHolding[]> {
  return (await readState(ownerId)).portfolio;
}

export async function upsertPortfolioHolding(input: {
  id?: string | null;
  ticker: string;
  region: Region;
  quantity: number;
  averageCost: number;
  currency?: string | null;
  notes?: string | null;
}, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<PortfolioHolding[]> {
  const state = await readState(ownerId);
  const now = new Date().toISOString();
  const existing = input.id ? state.portfolio.find((holding) => holding.id === input.id) : undefined;
  const holding: PortfolioHolding = {
    id: existing?.id ?? randomUUID(),
    ticker: input.ticker.toUpperCase(),
    region: input.region,
    quantity: input.quantity,
    averageCost: input.averageCost,
    currency: input.currency?.trim() ? input.currency.trim().toUpperCase() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const portfolio = [holding, ...state.portfolio.filter((item) => item.id !== holding.id)];
  return (await writeState({ ...state, portfolio }, {
    category: "portfolio",
    action: existing ? "portfolio_updated" : "portfolio_added",
    detail: `${holding.ticker} holding saved.`
  }, ownerId)).portfolio;
}

export async function removePortfolioHolding(id: string, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<PortfolioHolding[]> {
  const state = await readState(ownerId);
  const removed = state.portfolio.find((holding) => holding.id === id);
  return (await writeState({
    ...state,
    portfolio: state.portfolio.filter((holding) => holding.id !== id)
  }, {
    category: "portfolio",
    action: "portfolio_removed",
    detail: `${removed?.ticker ?? "Holding"} removed from portfolio.`
  }, ownerId)).portfolio;
}

export async function listAlerts(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<AlertWorkspaceState> {
  return (await readState(ownerId)).alerts;
}

export async function upsertAlertRule(input: {
  id?: string | null;
  ticker: string;
  region: Region;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  enabled?: boolean;
  schedule?: AlertRule["schedule"];
}, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<AlertRule[]> {
  const state = await readState(ownerId);
  const now = new Date().toISOString();
  const existing = input.id ? state.alerts.rules.find((rule) => rule.id === input.id) : undefined;
  const schedule = input.schedule ?? existing?.schedule ?? "hourly";
  const nextEvaluationAt =
    existing && existing.schedule === schedule
      ? existing.nextEvaluationAt
      : nextEvaluationFrom(now, schedule);
  const rule: AlertRule = {
    id: existing?.id ?? randomUUID(),
    ticker: input.ticker.toUpperCase(),
    region: input.region,
    metric: input.metric,
    operator: input.operator,
    threshold: input.threshold,
    enabled: input.enabled ?? existing?.enabled ?? true,
    schedule,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastTriggeredAt: existing?.lastTriggeredAt ?? null,
    lastEvaluatedAt: existing?.lastEvaluatedAt ?? null,
    nextEvaluationAt
  };
  const rules = [rule, ...state.alerts.rules.filter((item) => item.id !== rule.id)];
  return (await writeState({ ...state, alerts: { ...state.alerts, rules } }, {
    category: "alerts",
    action: existing ? "alert_updated" : "alert_added",
    detail: `${rule.ticker} ${rule.metric} alert saved.`
  }, ownerId)).alerts.rules;
}

export async function removeAlertRule(id: string, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<AlertRule[]> {
  const state = await readState(ownerId);
  const removed = state.alerts.rules.find((rule) => rule.id === id);
  return (await writeState({
    ...state,
    alerts: {
      ...state.alerts,
      rules: state.alerts.rules.filter((rule) => rule.id !== id),
      events: state.alerts.events
    }
  }, {
    category: "alerts",
    action: "alert_removed",
    detail: `${removed?.ticker ?? "Alert"} rule removed.`
  }, ownerId)).alerts.rules;
}

export async function replaceAlerts(input: AlertWorkspaceState, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<AlertWorkspaceState> {
  const state = await readState(ownerId);
  return (await writeState({ ...state, alerts: input }, {
    category: "alerts",
    action: "alerts_evaluated",
    detail: `${input.rules.length} alert rules evaluated; ${input.events.length} events and ${input.notifications.length} notifications retained.`
  }, ownerId)).alerts;
}

export async function getPrivacyConsent(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<PrivacyConsent> {
  return (await readState(ownerId)).privacy.consent;
}

export async function updatePrivacyConsent(input: Partial<Omit<PrivacyConsent, "updatedAt">>, ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<PrivacyConsent> {
  const state = await readState(ownerId);
  const consent: PrivacyConsent = {
    ...state.privacy.consent,
    ...input,
    updatedAt: new Date().toISOString()
  };
  const consentHistory: PrivacyConsentRecord[] = [
    {
      consent,
      reason: "User updated privacy preferences.",
      createdAt: consent.updatedAt
    },
    ...state.privacy.consentHistory
  ].slice(0, CONSENT_HISTORY_LIMIT);
  return (await writeState({ ...state, privacy: { ...state.privacy, consent, consentHistory } }, {
    category: "privacy",
    action: "privacy_consent_updated",
    detail: "Privacy consent preferences updated."
  }, ownerId)).privacy.consent;
}

export async function exportWorkspaceData(ownerId = DEFAULT_WORKSPACE_OWNER_ID, authEnabled = false): Promise<WorkspaceExportResponse> {
  const normalizedOwner = normalizeWorkspaceOwnerId(ownerId);
  const state = await readState(normalizedOwner);
  const { keyManagement } = await workspaceSecret();
  return {
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    storage: {
      provider: "local-encrypted-json",
      workspaceOwnerId: normalizedOwner,
      syncScope: authEnabled ? "authenticated-local" : "anonymous-local",
      cloudReady: true,
      authEnabled,
      encryptionAtRest: "local-aes-256-gcm",
      keyManagement,
      plaintextMigration: plaintextMigrationsThisRuntime.has(normalizedOwner),
      retentionDays: RETENTION_DAYS
    },
    privacy: {
      consent: state.privacy.consent,
      consentHistory: state.privacy.consentHistory,
      dataCategories: [
        "Watchlist tickers and selected regions",
        "Portfolio holdings entered by the user",
        "Alert rules and alert event history",
        "Privacy consent preferences and consent history",
        "Security audit events for workspace changes"
      ],
      rights: [
        "Access/export",
        "Rectification by editing saved records",
        "Erasure/delete workspace",
        "Portability as JSON",
        "Restriction by disabling optional consent flags"
      ],
      warnings: [
        "This local build has no hosted authentication provider yet, so data is scoped to this app instance rather than a verified cloud user.",
        "Local workspace data is encrypted at rest with AES-256-GCM, but hosted sync still needs provider-managed encryption, row-level access control, audit logging, and a data processing agreement before storing real user accounts."
      ]
    },
    data: {
      watchlist: state.watchlist,
      portfolio: state.portfolio,
      alerts: state.alerts,
      auditEvents: state.auditEvents
    },
    status: {
      label: "GDPR workspace export",
      status: "ok",
      detail: "Exports all user-entered workspace data, consent history, and security audit events currently stored by this app instance.",
      url: null
    }
  };
}

export async function deleteWorkspaceData(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<void> {
  await writeState({
    ...DEFAULT_STATE,
    updatedAt: new Date().toISOString(),
    privacy: {
      consent: {
        analytics: false,
        emailBriefs: false,
        productUpdates: false,
        updatedAt: new Date().toISOString()
      },
      consentHistory: []
    },
    auditEvents: []
  }, {
    category: "privacy",
    action: "workspace_deleted",
    detail: "Workspace data erased by typed confirmation."
  }, ownerId);
}

export async function purgeWorkspaceData(ownerId = DEFAULT_WORKSPACE_OWNER_ID): Promise<void> {
  const normalizedOwner = normalizeWorkspaceOwnerId(ownerId);
  for (const path of [
    secureStorePath(normalizedOwner),
    plaintextStorePath(normalizedOwner),
    ...(isDefaultOwner(normalizedOwner) ? [LEGACY_SECURE_STORE_PATH, LEGACY_PLAINTEXT_STORE_PATH] : [])
  ]) {
    try {
      await unlink(path);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }
}
