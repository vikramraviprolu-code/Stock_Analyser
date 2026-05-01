import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

const domain = process.env.STOCK_ANALYSER_DOMAIN || "stockanalyser.app";
const listenHost = process.env.STOCK_ANALYSER_HTTPS_HOST || "127.0.0.1";
const listenPort = Number(process.env.STOCK_ANALYSER_HTTPS_PORT || "443");
const targetHost = process.env.STOCK_ANALYSER_TARGET_HOST || "127.0.0.1";
const targetPort = Number(process.env.STOCK_ANALYSER_TARGET_PORT || "3000");
const certDir = path.resolve(process.cwd(), ".certs");
const keyPath = process.env.STOCK_ANALYSER_HTTPS_KEY || path.join(certDir, `${domain}-key.pem`);
const certPath = process.env.STOCK_ANALYSER_HTTPS_CERT || path.join(certDir, `${domain}.pem`);
const lifecyclePath = "/__stock-analyser-session";
const exitWhenIdle = process.env.STOCK_ANALYSER_EXIT_WHEN_IDLE === "true";
const idleShutdownMs = Number(process.env.STOCK_ANALYSER_IDLE_SHUTDOWN_MS || "30000");
const closeGraceMs = Number(process.env.STOCK_ANALYSER_CLOSE_GRACE_MS || "3000");
const startupGraceMs = Number(process.env.STOCK_ANALYSER_STARTUP_GRACE_MS || "60000");
const activeSessions = new Map();
const sockets = new Set();
let idleTimer;

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("Missing HTTPS certificate files. Run `npm run setup:https` first.");
  process.exit(1);
}

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
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function pruneExpiredSessions() {
  const cutoff = Date.now() - idleShutdownMs;
  for (const [sessionId, lastSeen] of activeSessions.entries()) {
    if (lastSeen < cutoff) {
      activeSessions.delete(sessionId);
    }
  }
}

function shutdownWhenIdle(reason) {
  if (!exitWhenIdle) {
    return;
  }

  pruneExpiredSessions();
  if (activeSessions.size > 0) {
    scheduleIdleCheck(idleShutdownMs);
    return;
  }

  console.log(`Stock Analyser HTTPS proxy shutting down: ${reason}`);
  server.close(() => process.exit(0));
  setTimeout(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    process.exit(0);
  }, 2000).unref();
}

function scheduleIdleCheck(delayMs) {
  if (!exitWhenIdle) {
    return;
  }

  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    shutdownWhenIdle("no active Stock Analyser webpage");
  }, Math.max(1000, delayMs));
  idleTimer.unref();
}

function isLifecycleRequest(requestUrl) {
  const url = new URL(requestUrl ?? "/", `https://${domain}`);
  return url.pathname === lifecyclePath || url.pathname.startsWith(`${lifecyclePath}/`);
}

async function handleLifecycleRequest(request, response) {
  const url = new URL(request.url ?? "/", `https://${domain}`);

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
    response.end(JSON.stringify({ ok: false, error: error.message }));
  }
}

const server = createServer(
  {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  },
  async (clientRequest, clientResponse) => {
    if (isLifecycleRequest(clientRequest.url)) {
      await handleLifecycleRequest(clientRequest, clientResponse);
      return;
    }

    const headers = {
      ...clientRequest.headers,
      host: `${targetHost}:${targetPort}`,
      "x-forwarded-host": domain,
      "x-forwarded-proto": "https"
    };

    const proxyRequest = httpRequest(
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

    proxyRequest.on("error", (error) => {
      clientResponse.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      clientResponse.end(
        `Stock Analyser HTTPS proxy could not reach Next at http://${targetHost}:${targetPort}.\n${error.message}\n`
      );
    });

    clientRequest.pipe(proxyRequest);
  }
);

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

server.on("upgrade", (request, clientSocket, head) => {
  const upstream = connect(targetPort, targetHost, () => {
    const headers = Object.entries({
      ...request.headers,
      host: `${targetHost}:${targetPort}`,
      "x-forwarded-host": domain,
      "x-forwarded-proto": "https"
    })
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value ?? ""}`)
      .join("\r\n");

    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head.length > 0) {
      upstream.write(head);
    }
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(listenPort, listenHost, () => {
  console.log(`Stock Analyser HTTPS proxy listening at https://${domain}`);
  console.log(`Forwarding to http://${targetHost}:${targetPort}`);
  if (exitWhenIdle) {
    console.log("Lifecycle mode enabled. The proxy will exit after the Stock Analyser webpage closes.");
    scheduleIdleCheck(startupGraceMs);
  }
});

server.on("error", (error) => {
  if (error.code === "EACCES") {
    console.error("Port 443 requires elevated privileges. Start this proxy with: sudo npm run https:proxy");
  } else {
    console.error(error);
  }
  process.exit(1);
});
