import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";

const domain = process.env.STOCK_ANALYSER_DOMAIN || "stockanalyser.app";
if (!/^[a-z0-9.-]+$/i.test(domain)) {
  throw new Error(`Unsafe domain value: ${domain}`);
}

const certDir = path.resolve(process.cwd(), ".certs");
const caCert = path.join(certDir, "stockanalyser-local-ca.pem");
const adminReadableCaCert = "/tmp/stockanalyser-local-ca.pem";

if (!existsSync(caCert)) {
  throw new Error("Missing local CA certificate. Run `npm run setup:https` first to generate certificates.");
}

copyFileSync(caCert, adminReadableCaCert);
chmodSync(adminReadableCaCert, 0o644);

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const hostsCommand = [
  `grep -q ${shellQuote(domain)} /etc/hosts`,
  `printf '\\n# Stock Analyser local HTTPS\\n127.0.0.1 ${domain}\\n' >> /etc/hosts`
].join(" || ");

const trustCommand = [
  "security",
  "add-trusted-cert",
  "-d",
  "-r",
  "trustRoot",
  "-k",
  "/Library/Keychains/System.keychain",
  shellQuote(adminReadableCaCert)
].join(" ");

const adminShellCommand = `${hostsCommand}; ${trustCommand}`;

execFileSync(
  "osascript",
  ["-e", `do shell script ${JSON.stringify(adminShellCommand)} with administrator privileges`],
  { stdio: "inherit" }
);

console.log(`Installed local trust and host mapping for https://${domain}`);
