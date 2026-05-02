import { cloudWorkspaceReadiness } from "./cloud-workspace";
import type { WorkspaceAdapter, WorkspaceAdapterStatus, WorkspaceSnapshot } from "./workspace-adapter";

export class CloudWorkspaceAdapter implements WorkspaceAdapter {
  async status(): Promise<WorkspaceAdapterStatus> {
    const readiness = cloudWorkspaceReadiness();
    return {
      provider: readiness.configured ? "cloud" : "local-encrypted-json",
      encryptionAtRest: readiness.configured ? "provider-managed" : "local-aes-256-gcm",
      keyManagement: readiness.configured ? "provider-managed" : "not-configured",
      cloudReady: readiness.configured,
      detail: readiness.detail
    };
  }

  async listOwnerIds(): Promise<string[]> {
    throw new Error("Cloud workspace adapter is not active until a database client is configured.");
  }

  async read(_ownerId: string): Promise<WorkspaceSnapshot | null> {
    throw new Error("Cloud workspace adapter is not active until a database client is configured.");
  }

  async write(_ownerId: string, _snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
    throw new Error("Cloud workspace adapter is not active until a database client is configured.");
  }

  async delete(_ownerId: string): Promise<void> {
    throw new Error("Cloud workspace adapter is not active until a database client is configured.");
  }

  async purge(_ownerId: string): Promise<void> {
    throw new Error("Cloud workspace adapter is not active until a database client is configured.");
  }
}
