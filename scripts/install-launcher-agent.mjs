import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error("The automatic URL launcher installer is currently implemented for macOS LaunchAgent only.");
}

const projectDir = process.env.STOCK_ANALYSER_PROJECT_DIR
  ? path.resolve(process.env.STOCK_ANALYSER_PROJECT_DIR)
  : path.resolve(process.cwd());
const label = "app.stockanalyser.launcher";
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const logsDir = path.join(os.homedir(), "Library", "Logs", "StockAnalyser");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const launcherScript = path.join(projectDir, "scripts", "on-demand-launcher.mjs");
const uid = typeof process.getuid === "function" ? process.getuid() : Number(process.env.UID);

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function launchctl(args, options = {}) {
  return spawnSync("/bin/launchctl", args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options
  });
}

if (!existsSync(launcherScript)) {
  throw new Error(`Missing launcher script: ${launcherScript}`);
}

mkdirSync(launchAgentsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

launchctl(["bootout", `gui/${uid}`, plistPath]);
launchctl(["bootout", `gui/${uid}/${label}`]);

if (process.argv.includes("--uninstall")) {
  rmSync(plistPath, { force: true });
  console.log("Removed Stock Analyser URL launcher LaunchAgent.");
  process.exit(0);
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(launcherScript)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(projectDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(`${path.dirname(process.execPath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`)}</string>
    <key>STOCK_ANALYSER_PROJECT_DIR</key>
    <string>${xmlEscape(projectDir)}</string>
    <key>STOCK_ANALYSER_PUBLIC_HTTP_PORT</key>
    <string>3000</string>
    <key>STOCK_ANALYSER_PUBLIC_HTTPS_PORT</key>
    <string>3443</string>
    <key>STOCK_ANALYSER_TARGET_PORT</key>
    <string>3100</string>
    <key>STOCK_ANALYSER_IDLE_SHUTDOWN_MS</key>
    <string>30000</string>
    <key>STOCK_ANALYSER_CLOSE_GRACE_MS</key>
    <string>3000</string>
    <key>STOCK_ANALYSER_STARTUP_GRACE_MS</key>
    <string>60000</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(logsDir, "launcher.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(logsDir, "launcher.err.log"))}</string>
</dict>
</plist>
`;

writeFileSync(plistPath, plist, "utf8");
execFileSync("/bin/chmod", ["644", plistPath], { stdio: "inherit" });

const bootstrap = launchctl(["bootstrap", `gui/${uid}`, plistPath]);
if (bootstrap.status !== 0) {
  process.stderr.write(bootstrap.stderr);
  throw new Error("Could not bootstrap the Stock Analyser launcher LaunchAgent.");
}

const kickstart = launchctl(["kickstart", "-k", `gui/${uid}/${label}`]);
if (kickstart.status !== 0) {
  process.stderr.write(kickstart.stderr);
}

console.log("Installed Stock Analyser URL launcher.");
console.log(`LaunchAgent: ${plistPath}`);
console.log("Open http://127.0.0.1:3000/ or https://stockanalyser.app:3443/ to start the app on demand.");
console.log("The managed Next app stops automatically shortly after the last page closes.");
