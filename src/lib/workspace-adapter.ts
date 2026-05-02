import type {
  AlertWorkspaceState,
  PrivacyConsent,
  PrivacyConsentRecord,
  PortfolioHolding,
  WatchlistItem,
  WorkspaceAuditEvent,
  WorkspaceExportResponse
} from "./types";

export interface WorkspaceSnapshot {
  watchlist: WatchlistItem[];
  portfolio: PortfolioHolding[];
  alerts: AlertWorkspaceState;
  privacy: {
    consent: PrivacyConsent;
    consentHistory: PrivacyConsentRecord[];
  };
  auditEvents: WorkspaceAuditEvent[];
  updatedAt: string;
}

export interface WorkspaceAdapterStatus {
  provider: WorkspaceExportResponse["storage"]["provider"];
  encryptionAtRest: WorkspaceExportResponse["storage"]["encryptionAtRest"];
  keyManagement: WorkspaceExportResponse["storage"]["keyManagement"];
  cloudReady: boolean;
  detail: string;
}

export interface WorkspaceAdapter {
  status(): Promise<WorkspaceAdapterStatus>;
  listOwnerIds(): Promise<string[]>;
  read(ownerId: string): Promise<WorkspaceSnapshot | null>;
  write(ownerId: string, snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  delete(ownerId: string): Promise<void>;
  purge(ownerId: string): Promise<void>;
}
