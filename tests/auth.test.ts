import { describe, expect, it } from "vitest";
import { validateAuthInput, workspaceOwnerIdForUser } from "../src/lib/auth";

describe("local auth foundation", () => {
  it("requires constrained usernames and strong local passphrases", () => {
    expect(validateAuthInput("ab", "long-enough-passphrase")).toContain("Username");
    expect(validateAuthInput("valid_user", "short")).toContain("Passphrase");
    expect(validateAuthInput("valid_user", "long-enough-passphrase")).toBeNull();
  });

  it("scopes workspaces to authenticated users when a session exists", () => {
    expect(workspaceOwnerIdForUser(null)).toBe("anonymous:local-default");
    expect(workspaceOwnerIdForUser({
      id: "user-id",
      username: "local",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastLoginAt: null
    })).toBe("user:user-id");
  });
});
