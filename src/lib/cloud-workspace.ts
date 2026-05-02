export const CLOUD_WORKSPACE_SCHEMA_VERSION = 1;
export const CLOUD_WORKSPACE_MIGRATION_PATH = "database/migrations/0001_cloud_workspace.sql";
export const CLOUD_WORKSPACE_REQUIRED_ENV = [
  "STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud",
  "STOCK_ANALYSER_DATABASE_URL"
] as const;

export type CloudWorkspaceProvider = "local-encrypted-json" | "cloud";
export type CloudDatabaseDriver = "postgres" | "unknown";

export interface CloudWorkspaceReadiness {
  configured: boolean;
  provider: CloudWorkspaceProvider;
  driver: CloudDatabaseDriver;
  schemaVersion: number;
  migrationPath: string;
  requiredEnv: string[];
  missingEnv: string[];
  sanitizedDatabaseUrl: string | null;
  detail: string;
  warnings: string[];
}

type EnvLike = Record<string, string | undefined>;

function normalizedProvider(env: EnvLike): string {
  return env.STOCK_ANALYSER_WORKSPACE_PROVIDER?.trim().toLowerCase() ?? "";
}

export function databaseDriverForUrl(databaseUrl: string | undefined): CloudDatabaseDriver {
  if (!databaseUrl?.trim()) {
    return "unknown";
  }

  try {
    const parsed = new URL(databaseUrl);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:" ? "postgres" : "unknown";
  } catch {
    return "unknown";
  }
}

export function sanitizeDatabaseUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl?.trim()) {
    return null;
  }

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.username) parsed.username = "user";
    if (parsed.password) parsed.password = "redacted";
    if (parsed.search) parsed.search = "";
    return parsed.toString();
  } catch {
    return "invalid-url";
  }
}

export function cloudWorkspaceReadiness(env: EnvLike = process.env): CloudWorkspaceReadiness {
  const provider = normalizedProvider(env);
  const databaseUrl = env.STOCK_ANALYSER_DATABASE_URL?.trim();
  const driver = databaseDriverForUrl(databaseUrl);
  const missingEnv = [
    ...(provider === "cloud" ? [] : ["STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud"]),
    ...(databaseUrl ? [] : ["STOCK_ANALYSER_DATABASE_URL"])
  ];
  const warnings = [
    ...(provider && provider !== "cloud" ? [`Unsupported workspace provider "${provider}". Use "cloud" to enable the cloud adapter.`] : []),
    ...(databaseUrl && driver === "unknown" ? ["STOCK_ANALYSER_DATABASE_URL must use a postgres:// or postgresql:// URL."] : []),
    ...(missingEnv.length > 0 ? ["Cloud sync is not connected yet. Local encrypted JSON remains the active workspace store."] : [])
  ];
  const configured = provider === "cloud" && Boolean(databaseUrl) && driver === "postgres";

  return {
    configured,
    provider: configured ? "cloud" : "local-encrypted-json",
    driver,
    schemaVersion: CLOUD_WORKSPACE_SCHEMA_VERSION,
    migrationPath: CLOUD_WORKSPACE_MIGRATION_PATH,
    requiredEnv: [...CLOUD_WORKSPACE_REQUIRED_ENV],
    missingEnv,
    sanitizedDatabaseUrl: configured ? sanitizeDatabaseUrl(databaseUrl) : null,
    detail: configured
      ? `Cloud workspace adapter is configured for Postgres schema v${CLOUD_WORKSPACE_SCHEMA_VERSION}. Run ${CLOUD_WORKSPACE_MIGRATION_PATH} and verify row-level security before switching production traffic.`
      : "The app is still using the local encrypted workspace adapter. This is suitable for local development, not hosted multi-user sync.",
    warnings
  };
}
