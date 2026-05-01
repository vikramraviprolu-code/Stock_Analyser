# Security Policy

## Supported Versions

This repository currently supports the latest `main` branch only.

## Reporting A Vulnerability

Do not open a public issue for exploitable vulnerabilities or secrets exposure.

Use a private channel with the repository owner and include:

- Affected route, component, or file.
- Reproduction steps.
- Expected impact.
- Suggested mitigation if known.

## Security Baseline

The app currently includes:

- Content Security Policy and common hardening headers.
- Cross-site mutation blocking for API routes.
- API request size limits and basic rate limiting.
- Local encrypted workspace storage using AES-256-GCM.
- Local account passphrase hashing with scrypt.
- Signed httpOnly session cookies.
- GDPR-oriented export/delete controls.
- Protected hosted alert worker endpoint requiring a bearer secret.

## Sensitive Files

These must never be committed:

- `.env` and `.env.*`
- `.stock-analyser-data/`
- `.certs/`
- `.cache/`
- local private keys, certificates, tokens, and generated workspace stores

## Production Readiness Notes

Before hosted multi-user launch, the app still needs:

- Managed identity provider.
- Tenant-isolated cloud database.
- Provider-managed encryption and backup retention.
- Production scheduler for alerts.
- Central logging and alerting.
- Data processing records and incident response process.
