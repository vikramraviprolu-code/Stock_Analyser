import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect } from "node:net";
import path from "node:path";
import { clearTimeout, setTimeout as delay, setTimeout } from "node:timers";
import { URL } from "node:url";

const projectDir = process.env.STOCK_ANALYSER_PROJECT_DIR
  ? path.resolve(process.env.STOCK_ANALYSER_PROJECT_DIR)
  : path.resolve(process.cwd());
const domain = process.env.STOCK_ANALYSER_DOMAIN || "stockanalyser.app";
const publicHost = process.env.STOCK_ANALYSER_PUBLIC_HOST || "127.0.0.1";
const publicHttpPort = Number(process.env.STOCK_ANALYSER_PUBLIC_HTTP_PORT || "3000");
const publicHttpsPort = Number(process.env.STOCK_ANALYSER_PUBLIC_HTTPS_PORT || "3443");
const targetHost = process.env.STOCK_ANALYSER_TARGET_HOST || "127.0.0.1";
const targetPort = Number(process.env.STOCK_ANALYSER_TARGET_PORT || "3100");
const idleShutdownMs = Number(process.env.STOCK_ANALYSER_IDLE_SHUTDOWN_MS || "30000");
const closeGraceMs = Number(process.env.STOCK_ANALYSER_CLOSE_GRACE_MS || "3000");
const startupGraceMs = Number(process.env.STOCK_ANALYSER_STARTUP_GRACE_MS || "60000");
const lifecyclePath = "/__stock-analyser-session";
const certDir = path.join(projectDir, ".certs");
const keyPath = process.env.STOCK_ANALYSER_HTTPS_KEY || path.join(certDir, `${domain}-key.pem`);
const certPath = process.env.STOCK_ANALYSER_HTTPS_CERT || path.join(certDir, `${domain}.pem`);
const nextBin = path.join(projectDir, "node_modules", "next", "dist", "bin", "next");

const activeSessions = new Map();
const sockets = new Set();
let nextProcess = null;
let nextStarting = null;
let idleTimer = null;

function sessionHeaders() {
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  };
}

function readBody(request, limit = 2048) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Session payload is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readSessionPayload(request) {
  const body = await readBody(request);
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function isLifecycleRequest(requestUrl) {
  const url = new URL(requestUrl ?? "/", `http://${publicHost}:${publicHttpPort}`);
  return url.pathname === lifecyclePath || url.pathname.startsWith(`${lifecyclePath}/`);
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - idleShutdownMs;
  for (const [sessionId, lastSeen] of activeSessions.entries()) {
    if (lastSeen < cutoff) {
      activeSessions.delete(sessionId);
    }
  }
}

function scheduleIdleCheck(delayMs) {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    pruneExpiredSessions();
    if (activeSessions.size > 0) {
      scheduleIdleCheck(idleShutdownMs);
      return;
    }
    stopNext("no active Stock Analyser webpage");
  }, Math.max(1000, delayMs));
  idleTimer.unref();
}

function stopNext(reason) {
  if (!nextProcess) {
    return;
  }

  const child = nextProcess;
  console.log(`Stopping Stock Analyser Next app: ${reason}`);
  nextProcess = null;
  nextStarting = null;
  child.kill("SIGTERM");

  const forceTimer = setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 5000);
  forceTimer.unref();
}

function requestTarget(pathname = "/", method = "GET") {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: targetHost,
        method,
        path: pathname,
        port: targetPort,
        timeout: 1000
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error("Timed out waiting for Next app."));
    });
    request.on("error", reject);
    request.end();
  });
}

async function isTargetReady() {
  try {
    const status = await requestTarget("/");
    return status >= 200 && status < 500;
  } catch {
    return false;
  }
}

async function waitForTargetReady(timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isTargetReady()) {
      return;
    }
    await new Promise((resolve) => delay(resolve, 300));
  }
  throw new Error(`Next app did not become ready on http://${targetHost}:${targetPort}.`);
}

async function ensureNextRunning() {
  if (await isTargetReady()) {
    scheduleIdleCheck(startupGraceMs);
    return;
  }

  if (nextStarting) {
    await nextStarting;
    return;
  }

  if (!existsSync(nextBin)) {
    throw new Error(`Next.js binary not found at ${nextBin}. Run npm install first.`);
  }

  console.log(`Starting Stock Analyser Next app on http://${targetHost}:${targetPort}`);
  const child = spawn(process.execPath, [nextBin, "dev", "-H", targetHost, "-p", String(targetPort)], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(targetPort),
      STOCK_ANALYSER_MANAGED_BY_LAUNCHER: "true"
    },
    stdio: "inherit"
  });
  nextProcess = child;

  child.on("exit", (code, signal) => {
    console.log(`Stock Analyser Next app exited (${signal ?? code ?? "unknown"}).`);
    if (nextProcess?.pid === child.pid) {
      nextProcess = null;
    }
    nextStarting = null;
  });

  nextStarting = waitForTargetReady().finally(() => {
    nextStarting = null;
    scheduleIdleCheck(startupGraceMs);
  });
  await nextStarting;
}

async function handleLifecycleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${publicHost}:${publicHttpPort}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, sessionHeaders());
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, sessionHeaders());
    response.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const payload = await readSessionPayload(request);
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.slice(0, 100) : "";
    const event = url.pathname.endsWith("/end") ? "end" : "heartbeat";

    if (sessionId && event === "end") {
      activeSessions.delete(sessionId);
      scheduleIdleCheck(closeGraceMs);
    } else if (sessionId) {
      activeSessions.set(sessionId, Date.now());
      scheduleIdleCheck(idleShutdownMs);
    }

    response.writeHead(204, sessionHeaders());
    response.end();
  } catch (error) {
    response.writeHead(400, sessionHeaders());
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Bad session payload." }));
  }
}

async function proxyRequest(clientRequest, clientResponse, protocol) {
  if (isLifecycleRequest(clientRequest.url)) {
    await handleLifecycleRequest(clientRequest, clientResponse);
    return;
  }

  try {
    await ensureNextRunning();
  } catch (error) {
    clientResponse.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    clientResponse.end(error instanceof Error ? error.message : "Stock Analyser could not start.");
    return;
  }

  const headers = {
    ...clientRequest.headers,
    host: `${targetHost}:${targetPort}`,
    "x-forwarded-host": clientRequest.headers.host ?? `${publicHost}:${publicHttpPort}`,
    "x-forwarded-proto": protocol
  };

  const proxy = httpRequest(
    {
      hostname: targetHost,
      port: targetPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers
    },
    (proxyResponse) => {
      clientResponse.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(clientResponse);
    }
  );

  proxy.on("error", (error) => {
    clientResponse.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    clientResponse.end(`Stock Analyser proxy could not reach the managed app.\n${error.message}\n`);
  });

  clientRequest.pipe(proxy);
}

async function proxyUpgrade(request, clientSocket, head, protocol) {
  try {
    await ensureNextRunning();
  } catch {
    clientSocket.destroy();
    return;
  }

  const upstream = connect(targetPort, targetHost, () => {
    const headers = Object.entries({
      ...request.headers,
      host: `${targetHost}:${targetPort}`,
      "x-forwarded-host": request.headers.host ?? `${publicHost}:${publicHttpPort}`,
      "x-forwarded-proto": protocol
    })
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value ?? ""}`)
      .join("\r\n");

    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
}

function trackSockets(server) {
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
}

const httpServer = createHttpServer((request, response) => {
  void proxyRequest(request, response, "http");
});
httpServer.on("upgrade", (request, socket, head) => {
  void proxyUpgrade(request, socket, head, "http");
});
trackSockets(httpServer);

httpServer.listen(publicHttpPort, publicHost, () => {
  console.log(`Stock Analyser launcher listening at http://${publicHost}:${publicHttpPort}`);
  console.log(`Managed Next target: http://${targetHost}:${targetPort}`);
});

if (existsSync(keyPath) && existsSync(certPath)) {
  const httpsServer = createHttpsServer(
    {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath)
    },
    (request, response) => {
      void proxyRequest(request, response, "https");
    }
  );
  httpsServer.on("upgrade", (request, socket, head) => {
    void proxyUpgrade(request, socket, head, "https");
  });
  trackSockets(httpsServer);
  httpsServer.listen(publicHttpsPort, publicHost, () => {
    console.log(`Stock Analyser launcher listening at https://${domain}:${publicHttpsPort}`);
  });
} else {
  console.warn("HTTPS certificate files are missing; HTTPS launcher endpoint is disabled. Run npm run setup:https.");
}

function shutdown() {
  stopNext("launcher shutdown");
  for (const socket of sockets) {
    socket.destroy();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
