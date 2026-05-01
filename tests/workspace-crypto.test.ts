import { describe, expect, it } from "vitest";
import { decryptJson, deriveWorkspaceKey, encryptJson, generateWorkspaceSecret } from "../src/lib/workspace-crypto";

describe("workspace crypto", () => {
  it("encrypts and decrypts JSON with AES-256-GCM", () => {
    const secret = generateWorkspaceSecret();
    const payload = {
      watchlist: [{ ticker: "AAPL", region: "USA" }],
      consent: { analytics: false }
    };

    const encrypted = encryptJson(payload, secret);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.ciphertext).not.toContain("AAPL");
    expect(decryptJson<typeof payload>(encrypted, secret)).toEqual(payload);
  });

  it("derives stable 32 byte keys from arbitrary secrets", () => {
    const first = deriveWorkspaceKey("local-secret");
    const second = deriveWorkspaceKey("local-secret");

    expect(first.length).toBe(32);
    expect(first.equals(second)).toBe(true);
  });
});
