import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const domain = process.env.STOCK_ANALYSER_DOMAIN || "stockanalyser.app";
if (!/^[a-z0-9.-]+$/i.test(domain)) {
  throw new Error(`Unsafe domain value: ${domain}`);
}

const certDir = path.resolve(process.cwd(), ".certs");
const caKey = path.join(certDir, "stockanalyser-local-ca-key.pem");
const caCert = path.join(certDir, "stockanalyser-local-ca.pem");
const caSerial = path.join(certDir, "stockanalyser-local-ca.srl");
const leafKey = path.join(certDir, `${domain}-key.pem`);
const leafCsr = path.join(certDir, `${domain}.csr`);
const leafCert = path.join(certDir, `${domain}.pem`);
const leafExt = path.join(certDir, `${domain}.ext`);

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function hasCommand(command) {
  return spawnSync("/usr/bin/env", ["which", command], { stdio: "ignore" }).status === 0;
}

if (!hasCommand("openssl")) {
  throw new Error("OpenSSL is required to generate local HTTPS certificates, but it was not found.");
}

mkdirSync(certDir, { recursive: true });

if (!existsSync(caKey) || !existsSync(caCert)) {
  run("openssl", ["genrsa", "-out", caKey, "4096"]);
  run("openssl", [
    "req",
    "-x509",
    "-new",
    "-nodes",
    "-key",
    caKey,
    "-sha256",
    "-days",
    "825",
    "-subj",
    "/CN=Stock Analyser Local Development CA",
    "-out",
    caCert
  ]);
}

writeFileSync(
  leafExt,
  [
    "authorityKeyIdentifier=keyid,issuer",
    "basicConstraints=CA:FALSE",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    `subjectAltName = DNS:${domain}, DNS:localhost, IP:127.0.0.1, IP:::1`,
    ""
  ].join("\n")
);

run("openssl", ["genrsa", "-out", leafKey, "2048"]);
run("openssl", ["req", "-new", "-key", leafKey, "-subj", `/CN=${domain}`, "-out", leafCsr]);
run("openssl", [
  "x509",
  "-req",
  "-in",
  leafCsr,
  "-CA",
  caCert,
  "-CAkey",
  caKey,
  "-CAcreateserial",
  "-out",
  leafCert,
  "-days",
  "825",
  "-sha256",
  "-extfile",
  leafExt
]);

try {
  run("chmod", ["600", caKey, leafKey]);
  run("chmod", ["644", caCert, leafCert]);
} catch {
  // chmod is best-effort on non-POSIX environments.
}

const hosts = readFileSync("/etc/hosts", "utf8");
if (!hosts.match(new RegExp(`(^|\\s)${domain.replace(".", "\\.")}(\\s|$)`))) {
  run("sudo", [
    "/bin/sh",
    "-c",
    `printf '\\n# Stock Analyser local HTTPS\\n127.0.0.1 ${domain}\\n' >> /etc/hosts`
  ]);
}

if (process.platform === "darwin") {
  if (!existsSync(caSerial)) {
    writeFileSync(caSerial, "");
  }
  run("sudo", [
    "security",
    "add-trusted-cert",
    "-d",
    "-r",
    "trustRoot",
    "-k",
    "/Library/Keychains/System.keychain",
    caCert
  ]);
} else {
  console.warn("Certificate trust was generated, but automatic OS trust installation is only implemented for macOS.");
}

console.log(`\nLocal HTTPS is ready for https://${domain}`);
console.log("Start Next with: npm run dev:local");
console.log("In another terminal, start the TLS proxy with: sudo npm run https:proxy");
