export type Region =
  | "USA"
  | "India"
  | "Europe"
  | "Japan"
  | "Hong Kong"
  | "South Korea"
  | "Taiwan"
  | "Australia"
  | "Singapore"
  | "Asia-Pacific";

export type DataMode = "live";

export type SourceVerification =
  | "primary"
  | "recognized"
  | "computed"
  | "search-hint"
  | "fallback"
  | "unavailable";

export interface OhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryMetrics {
  latestClose: number | null;
  high52Week: number | null;
  low52Week: number | null;
  percentFromLow: number | null;
  averageVolume: number | null;
  performance5D: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi14: number | null;
  roc14: number | null;
  roc21: number | null;
}

export interface FundamentalData {
  ticker: string;
  companyName: string | null;
  exchange: string | null;
  country: string | null;
  region: Region;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  marketCapUsd: number | null;
  marketCapEur: number | null;
  trailingPe: number | null;
  averageVolume: number | null;
  revenueTtm: number | null;
  epsTtm: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity: number | null;
  freeCashFlow: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  peers: string[];
  earningsDate: string | null;
}

export interface SymbolMatch {
  ticker: string;
  name: string | null;
  exchange: string | null;
  region: Region;
  source: "seeded" | "recognized" | "alias";
  sourceUrl: string | null;
  confidence?: number;
  matchReason?: string;
  stooqSymbols?: string[];
  primaryListing?: "likely" | "unknown";
  warnings?: string[];
}

export interface SourceRecord {
  metric: string;
  value: string;
  source: string;
  url: string | null;
  retrievedAt: string;
  freshness: string;
  verification?: SourceVerification;
  confidence?: number;
  warning?: string;
}

export interface SourceStatus {
  label: string;
  status: "ok" | "warning" | "error" | "unavailable";
  detail: string;
  url?: string | null;
}

export interface FilterCriterion {
  label: string;
  actual: number | null;
  threshold: number;
  unit: string;
  passed: boolean | null;
  detail?: string;
}

export interface FilterResult {
  region: Region;
  passed: boolean;
  criteria: FilterCriterion[];
  warnings: string[];
}

export interface PeerScoreRow {
  ticker: string;
  companyName: string | null;
  country: string | null;
  region: Region;
  sector: string | null;
  industry: string | null;
  latestClose: number | null;
  percentFromLow: number | null;
  trailingPe: number | null;
  averageVolume: number | null;
  performance5D: number | null;
  roc14: number | null;
  roc21: number | null;
  rsi14: number | null;
  rsiLabel: string;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  priceVsMa20: string;
  priceVsMa50: string;
  priceVsMa200: string;
  signal: string;
  outlook: string;
  confidence: number;
  filters: FilterResult;
  qualifiesValue: boolean;
  matchReason: string;
}

export interface Recommendation {
  bullCase: string[];
  bearCase: string[];
  baseCase: string;
  catalysts: string[];
  fundamentalRisks: string[];
  technicalRisks: string[];
  finalRating: "Buy" | "Watch" | "Avoid";
  confidence: number;
  timeHorizon: string;
  scores: {
    value: number;
    momentum: number;
    dataQuality: number;
    total: number;
  };
}

export interface DataReliabilityGate {
  label: string;
  status: SourceStatus["status"];
  detail: string;
}

export interface DataReliabilitySummary {
  score: number;
  label: "High" | "Medium" | "Low";
  coveragePercent: number;
  warningPenalty: number;
  gates: DataReliabilityGate[];
  sourceMix: {
    primary: number;
    recognized: number;
    computed: number;
    fallback: number;
    unavailable: number;
  };
}

export interface ScreenerRow {
  ticker: string;
  region: Region;
  companyName: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  latestClose: number | null;
  marketCapUsd: number | null;
  trailingPe: number | null;
  averageVolume: number | null;
  percentFromLow: number | null;
  performance5D: number | null;
  roc14: number | null;
  roc21: number | null;
  rsi14: number | null;
  rsiLabel: string;
  priceVsMa20: string;
  priceVsMa50: string;
  priceVsMa200: string;
  signal: string;
  outlook: string;
  confidence: number;
  valueScore: number;
  momentumScore: number;
  dataQualityScore: number;
  totalScore: number;
  qualifiesValue: boolean;
  filtersPassed: boolean;
  sourceCount: number;
  warningCount: number;
  historyProvider: string | null;
  historySourceUrl: string | null;
  chartRows: OhlcvRow[];
  warnings: string[];
  retrievedAt: string;
  status: "ok" | "warning" | "error";
}

export interface ScreenerResponse {
  mode: "live";
  universe: string;
  retrievedAt: string;
  rows: ScreenerRow[];
  warnings: string[];
  sourceStatuses: SourceStatus[];
}

export interface ValidationRow {
  ticker: string;
  region: Region;
  companyName: string | null;
  historyStatus: "ok" | "warning" | "error";
  fundamentalsStatus: "ok" | "warning" | "error";
  stooqStatus: "primary" | "fallback" | "unavailable";
  metricCoverage: number;
  sourceConfidence: number;
  sourceCount: number;
  warningCount: number;
  unavailableMetrics: string[];
  historyProvider: string | null;
  historySourceUrl: string | null;
  retrievedAt: string;
}

export interface ValidationResponse {
  mode: "live";
  universe: string;
  retrievedAt: string;
  rows: ValidationRow[];
  warnings: string[];
  sourceStatuses: SourceStatus[];
}

export interface EventRow {
  ticker: string;
  companyName: string | null;
  region: Region;
  eventType: "Earnings";
  eventDate: string | null;
  source: string;
  sourceUrl: string | null;
  status: "ok" | "unavailable";
  warning?: string;
}

export interface EventsResponse {
  mode: "live";
  retrievedAt: string;
  rows: EventRow[];
  warnings: string[];
  sourceStatuses: SourceStatus[];
}

export interface WatchlistItem {
  ticker: string;
  region: Region;
  addedAt: string;
}

export interface WatchlistResponse {
  mode: "server-synced";
  retrievedAt: string;
  items: WatchlistItem[];
  status: SourceStatus;
}

export interface PortfolioHolding {
  id: string;
  ticker: string;
  region: Region;
  quantity: number;
  averageCost: number;
  currency: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioRow extends PortfolioHolding {
  companyName: string | null;
  latestClose: number | null;
  marketValue: number | null;
  costBasis: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  sector: string | null;
  sourceWarnings: string[];
}

export interface PortfolioResponse {
  mode: "server-synced";
  retrievedAt: string;
  holdings: PortfolioHolding[];
  rows: PortfolioRow[];
  totals: {
    marketValue: number | null;
    costBasis: number | null;
    unrealizedPnl: number | null;
    unrealizedPnlPercent: number | null;
  };
  warnings: string[];
  status: SourceStatus;
}

export type AlertMetric = "price" | "rsi14" | "percentFromLow" | "performance5D";
export type AlertOperator = "above" | "below";
export type AlertSchedule = "manual" | "hourly" | "daily";
export type AlertNotificationStatus = "delivered" | "read";

export interface AlertRule {
  id: string;
  ticker: string;
  region: Region;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  lastEvaluatedAt: string | null;
  nextEvaluationAt: string | null;
  schedule: AlertSchedule;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ticker: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  actual: number | null;
  triggeredAt: string;
  message: string;
}

export interface AlertNotification {
  id: string;
  eventId: string;
  ruleId: string;
  ticker: string;
  title: string;
  message: string;
  status: AlertNotificationStatus;
  createdAt: string;
  deliveredAt: string;
  readAt: string | null;
}

export interface AlertSchedulerRun {
  id: string;
  trigger: "manual" | "scheduled";
  startedAt: string;
  finishedAt: string;
  rulesChecked: number;
  eventsCreated: number;
  notificationsCreated: number;
  warnings: string[];
}

export interface AlertWorkspaceState {
  rules: AlertRule[];
  events: AlertEvent[];
  notifications: AlertNotification[];
  schedulerRuns: AlertSchedulerRun[];
}

export interface AlertSchedulerStatus {
  enabled: boolean;
  localOnly: boolean;
  activeWhilePageOpen: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  dueRules: number;
  detail: string;
}

export interface AlertsResponse {
  mode: "server-synced";
  retrievedAt: string;
  rules: AlertRule[];
  events: AlertEvent[];
  notifications: AlertNotification[];
  schedulerRuns: AlertSchedulerRun[];
  scheduler: AlertSchedulerStatus;
  warnings: string[];
  status: SourceStatus;
}

export interface AlertSchedulerResponse {
  mode: "local-scheduled-alerts";
  retrievedAt: string;
  ownerId: string;
  run: AlertSchedulerRun;
  scheduler: AlertSchedulerStatus;
  warnings: string[];
  status: SourceStatus;
}

export interface AlertWorkerOwnerResult {
  ownerId: string;
  rulesChecked: number;
  eventsCreated: number;
  notificationsCreated: number;
  warnings: string[];
  status: "ok" | "warning" | "error";
}

export interface AlertWorkerResponse {
  mode: "hosted-alert-worker";
  retrievedAt: string;
  force: boolean;
  ownersScanned: number;
  totals: {
    rulesChecked: number;
    eventsCreated: number;
    notificationsCreated: number;
    warnings: number;
  };
  ownerResults: AlertWorkerOwnerResult[];
  status: SourceStatus;
}

export interface DeploymentReadinessResponse {
  mode: "deployment-readiness";
  retrievedAt: string;
  cloudSync: {
    configured: boolean;
    provider: "local-encrypted-json" | "cloud";
    driver: "postgres" | "unknown";
    schemaVersion: number;
    migrationPath: string;
    requiredEnv: string[];
    missingEnv: string[];
    sanitizedDatabaseUrl: string | null;
    detail: string;
    warnings: string[];
  };
  hostedWorker: {
    configured: boolean;
    endpoint: string;
    auth: "bearer-secret";
    minSecretLength: number;
    detail: string;
    warning: string | null;
  };
  security: {
    cspEnabled: boolean;
    csrfProtection: boolean;
    rateLimiting: boolean;
    apiNoStore: boolean;
    strictTransportSecurity: boolean;
  };
  gdpr: {
    exportEnabled: boolean;
    deleteEnabled: boolean;
    consentHistory: boolean;
    auditTrail: boolean;
  };
  warnings: string[];
  status: SourceStatus;
}

export interface PrivacyConsent {
  analytics: boolean;
  emailBriefs: boolean;
  productUpdates: boolean;
  updatedAt: string;
}

export interface PrivacyConsentRecord {
  consent: PrivacyConsent;
  reason: string;
  createdAt: string;
}

export interface WorkspaceAuditEvent {
  id: string;
  category: "watchlist" | "portfolio" | "alerts" | "privacy" | "system";
  action: string;
  detail: string;
  createdAt: string;
}

export interface AuthUserProfile {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSessionResponse {
  mode: "local-auth";
  retrievedAt: string;
  authenticated: boolean;
  user: AuthUserProfile | null;
  workspaceOwnerId: string;
  provider: "local-encrypted-auth";
  cloudReady: boolean;
  warnings: string[];
  status: SourceStatus;
}

export interface WorkspaceExportResponse {
  mode: "server-synced";
  retrievedAt: string;
  storage: {
    provider: "local-json" | "local-encrypted-json" | "cloud";
    workspaceOwnerId: string;
    syncScope: "anonymous-local" | "authenticated-local" | "cloud-user";
    cloudReady: boolean;
    authEnabled: boolean;
    encryptionAtRest: "local-filesystem" | "local-aes-256-gcm" | "provider-managed";
    keyManagement: "local-0600-key-file" | "environment-secret" | "provider-managed" | "not-configured";
    plaintextMigration: boolean;
    retentionDays: number | null;
  };
  privacy: {
    consent: PrivacyConsent;
    consentHistory: PrivacyConsentRecord[];
    dataCategories: string[];
    rights: string[];
    warnings: string[];
  };
  data: {
    watchlist: WatchlistItem[];
    portfolio: PortfolioHolding[];
    alerts: {
      rules: AlertRule[];
      events: AlertEvent[];
      notifications: AlertNotification[];
      schedulerRuns: AlertSchedulerRun[];
    };
    auditEvents: WorkspaceAuditEvent[];
  };
  status: SourceStatus;
}

export interface WorkspaceDeleteResponse {
  mode: "server-synced";
  retrievedAt: string;
  deleted: boolean;
  status: SourceStatus;
}

export interface AnalysisResponse {
  mode: DataMode;
  query: string;
  ticker: string;
  region: Region;
  resolvedFromSearch: boolean;
  retrievedAt: string;
  history: {
    provider: string;
    sourceUrl: string | null;
    stooqSymbol: string | null;
    rowCount: number;
    rows: OhlcvRow[];
    metrics: HistoryMetrics;
  } | null;
  fundamentals: FundamentalData;
  filters: FilterResult;
  valueScreen: {
    inputQualifies: boolean;
    peers: PeerScoreRow[];
  };
  momentum: {
    topPeers: PeerScoreRow[];
  };
  crossAnalysis: {
    peerCount: number;
    valuePeerCount: number;
    momentumPeerCount: number;
    notes: string[];
  };
  recommendation: Recommendation;
  dataReliability: DataReliabilitySummary;
  sourceRecords: SourceRecord[];
  sourceStatuses: SourceStatus[];
  warnings: string[];
}
