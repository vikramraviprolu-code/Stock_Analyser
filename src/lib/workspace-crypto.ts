import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedJsonEnvelope {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

export function deriveWorkspaceKey(secret: string | Buffer): Buffer {
  if (Buffer.isBuffer(secret) && secret.length === 32) {
    return secret;
  }
  return createHash("sha256").update(secret).digest();
}

export function generateWorkspaceSecret(): string {
  return randomBytes(32).toString("base64");
}

export function encryptJson(value: unknown, secret: string | Buffer): EncryptedJsonEnvelope {
  const key = deriveWorkspaceKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    updatedAt: new Date().toISOString()
  };
}

export function decryptJson<T>(envelope: EncryptedJsonEnvelope, secret: string | Buffer): T {
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted workspace format.");
  }

  const key = deriveWorkspaceKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf-8")) as T;
}
