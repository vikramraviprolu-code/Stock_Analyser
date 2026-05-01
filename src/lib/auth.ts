import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextResponse } from "next/server";
import { decryptJson, encryptJson, generateWorkspaceSecret, type EncryptedJsonEnvelope } from "./workspace-crypto";
import type { AuthSessionResponse, AuthUserProfile } from "./types";

interface AuthUserRecord extends AuthUserProfile {
  passphraseHash: string;
  passphraseSalt: string;
  hashAlgorithm: "scrypt";
}

interface AuthState {
  users: AuthUserRecord[];
  updatedAt: string;
}

interface SessionPayload {
  userId: string;
  username: string;
  issuedAt: string;
  expiresAt: string;
}

const scrypt = promisify(scryptCallback);
const STORE_DIR = process.env.STOCK_ANALYSER_DATA_DIR?.trim() || ".stock-analyser-data";
const AUTH_STORE_PATH = join(STORE_DIR, "auth.secure.json");
const AUTH_KEY_PATH = join(STORE_DIR, ".auth-key");
const SESSION_COOKIE = "stock_analyser_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ANONYMOUS_WORKSPACE_OWNER_ID = "anonymous:local-default";
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

async function authSecret(): Promise<string> {
  const environmentSecret = process.env.STOCK_ANALYSER_AUTH_KEY;
  if (environmentSecret?.trim()) {
    return environmentSecret;
  }

  try {
    return (await readFile(AUTH_KEY_PATH, "utf-8")).trim();
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const secret = generateWorkspaceSecret();
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(AUTH_KEY_PATH, `${secret}\n`, { encoding: "utf-8", mode: 0o600 });
  return secret;
}

async function readAuthState(): Promise<AuthState> {
  try {
    const raw = await readFile(AUTH_STORE_PATH, "utf-8");
    const secret = await authSecret();
    const parsed = decryptJson<Partial<AuthState>>(JSON.parse(raw) as EncryptedJsonEnvelope, secret);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString()
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return { users: [], updatedAt: new Date(0).toISOString() };
    }
    throw error;
  }
}

async function writeAuthState(state: AuthState): Promise<AuthState> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  const secret = await authSecret();
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(AUTH_STORE_PATH, `${JSON.stringify(encryptJson(next, secret), null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  return next;
}

function publicUser(user: AuthUserRecord): AuthUserProfile {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateAuthInput(username: string, passphrase: string): string | null {
  const normalized = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username must be 3-40 characters and use only letters, numbers, dot, underscore, or hyphen.";
  }
  if (passphrase.length < 10) {
    return "Passphrase must be at least 10 characters.";
  }
  return null;
}

async function hashPassphrase(passphrase: string, salt = randomBytes(16).toString("base64")): Promise<{ hash: string; salt: string }> {
  const derived = (await scrypt(passphrase, salt, 64)) as Buffer;
  return { hash: derived.toString("base64"), salt };
}

async function verifyPassphrase(passphrase: string, user: AuthUserRecord): Promise<boolean> {
  const { hash } = await hashPassphrase(passphrase, user.passphraseSalt);
  const expected = Buffer.from(user.passphraseHash, "base64");
  const actual = Buffer.from(hash, "base64");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerLocalUser(username: string, passphrase: string): Promise<AuthUserProfile> {
  const validationError = validateAuthInput(username, passphrase);
  if (validationError) {
    throw new Error(validationError);
  }

  const normalized = normalizeUsername(username);
  const state = await readAuthState();
  if (state.users.some((user) => user.username === normalized)) {
    throw new Error("That username already exists.");
  }

  const now = new Date().toISOString();
  const credentials = await hashPassphrase(passphrase);
  const user: AuthUserRecord = {
    id: randomBytes(16).toString("hex"),
    username: normalized,
    passphraseHash: credentials.hash,
    passphraseSalt: credentials.salt,
    hashAlgorithm: "scrypt",
    createdAt: now,
    lastLoginAt: now
  };
  await writeAuthState({ ...state, users: [user, ...state.users] });
  return publicUser(user);
}

export async function loginLocalUser(username: string, passphrase: string): Promise<AuthUserProfile> {
  const normalized = normalizeUsername(username);
  const state = await readAuthState();
  const user = state.users.find((item) => item.username === normalized);
  if (!user || !(await verifyPassphrase(passphrase, user))) {
    throw new Error("Invalid username or passphrase.");
  }

  const updated: AuthUserRecord = { ...user, lastLoginAt: new Date().toISOString() };
  await writeAuthState({
    ...state,
    users: [updated, ...state.users.filter((item) => item.id !== user.id)]
  });
  return publicUser(updated);
}

export async function deleteLocalUser(userId: string): Promise<void> {
  const state = await readAuthState();
  await writeAuthState({
    ...state,
    users: state.users.filter((user) => user.id !== userId)
  });
}

async function signSession(payload: SessionPayload): Promise<string> {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", await authSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

async function verifySessionToken(token: string | undefined): Promise<AuthUserProfile | null> {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", await authSecret()).update(encodedPayload).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>;
  if (!payload.userId || !payload.username || !payload.expiresAt || new Date(payload.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const state = await readAuthState();
  const user = state.users.find((item) => item.id === payload.userId && item.username === payload.username);
  return user ? publicUser(user) : null;
}

function requestIsHttps(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export async function setAuthSessionCookie(response: NextResponse, request: Request, user: AuthUserProfile): Promise<void> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_SECONDS * 1000);
  const token = await signSession({
    userId: user.id,
    username: user.username,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: requestIsHttps(request) || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearAuthSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getAuthUserFromRequest(request: Request): Promise<AuthUserProfile | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return verifySessionToken(token);
}

export function workspaceOwnerIdForUser(user: AuthUserProfile | null): string {
  return user ? `user:${user.id}` : ANONYMOUS_WORKSPACE_OWNER_ID;
}

export async function workspaceOwnerId(request: Request): Promise<string> {
  return workspaceOwnerIdForUser(await getAuthUserFromRequest(request));
}

export async function authSessionResponse(request: Request): Promise<AuthSessionResponse> {
  const user = await getAuthUserFromRequest(request);
  const authenticated = user !== null;
  return {
    mode: "local-auth",
    retrievedAt: new Date().toISOString(),
    authenticated,
    user,
    workspaceOwnerId: workspaceOwnerIdForUser(user),
    provider: "local-encrypted-auth",
    cloudReady: true,
    warnings: authenticated
      ? ["This is a local encrypted account. Hosted cloud sync still needs a production identity provider."]
      : ["You are using the anonymous local workspace. Create or sign into a local account to isolate workspace data by user."],
    status: {
      label: authenticated ? "Authenticated workspace" : "Anonymous workspace",
      status: authenticated ? "ok" : "warning",
      detail: authenticated
        ? "Workspace requests are scoped to the signed-in local account."
        : "Workspace requests use the anonymous local workspace until a user signs in.",
      url: null
    }
  };
}
