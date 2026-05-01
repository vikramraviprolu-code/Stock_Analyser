import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.STOCK_ANALYSER_PROJECT_DIR ? path.resolve(process.env.STOCK_ANALYSER_PROJECT_DIR) : path.resolve(scriptDir, "..");
const daemonPlist = "/Library/LaunchDaemons/com.equityscope.global.plist";
const nodeBin = "/usr/local/bin/node";
const logPath = "/tmp/stock-analyser-https.log";
const proxyScript = process.env.STOCK_ANALYSER_PROXY_SCRIPT || path.join(projectDir, "scripts/https-proxy.mjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options
  });

  return result;
}

if (typeof process.getuid === "function" && process.getuid() !== 0) {
  console.error("This script must be run as root because it binds local port 443.");
  process.exit(1);
}

if (existsSync(daemonPlist)) {
  run("/bin/launchctl", ["bootout", "system", daemonPlist]);
}

run("/usr/bin/pkill", ["-f", "/usr/local/global-stock-analyser/app.py"]);
run("/usr/bin/pkill", ["-f", "https-proxy.mjs"]);

const out = openSync(logPath, "a");
const child = spawn(nodeBin, [proxyScript], {
  cwd: projectDir,
  detached: true,
  env: {
    ...process.env,
    STOCK_ANALYSER_HTTPS_HOST: "127.0.0.1",
    STOCK_ANALYSER_HTTPS_PORT: "443",
    STOCK_ANALYSER_EXIT_WHEN_IDLE: "true",
    STOCK_ANALYSER_IDLE_SHUTDOWN_MS: "30000",
    STOCK_ANALYSER_CLOSE_GRACE_MS: "3000",
    STOCK_ANALYSER_STARTUP_GRACE_MS: "300000",
    STOCK_ANALYSER_TARGET_HOST: "127.0.0.1",
    STOCK_ANALYSER_TARGET_PORT: "3000"
  },
  stdio: ["ignore", out, out]
});

child.unref();

const check = run("/usr/sbin/lsof", ["-nP", "-iTCP:443", "-sTCP:LISTEN"]);
if (check.status === 0) {
  process.stdout.write(check.stdout);
}

console.log(`Stock Analyser HTTPS proxy requested on https://stockanalyser.app`);
console.log(`Log: ${logPath}`);
