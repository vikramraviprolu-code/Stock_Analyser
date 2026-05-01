# Stock Analyser

Stock Analyser is a Next.js + TypeScript market analysis workstation for public-source equity research. It is designed to analyze global tickers and company names across the USA, India, Europe, Japan, Hong Kong, South Korea, Taiwan, Australia, Singapore, and broader Asia-Pacific coverage.

The app uses free public sources, keeps unavailable metrics explicit as `Data unavailable`, and avoids paid APIs and fabricated data.

> This analysis is for informational purposes only and is not financial advice. Free-source market data may be delayed, incomplete, adjusted, stale, or unavailable. Investors should verify all data independently or consult a qualified financial advisor before making investment decisions.

## Current Version

- App version: `2.4.0`
- Codename: `Hosted Worker Readiness`
- Release log: [VERSION_HISTORY.md](VERSION_HISTORY.md)
- Implementation log: [CHANGE_HISTORY.md](CHANGE_HISTORY.md)

## Core Capabilities

- Landing page and dense market workstation UI.
- Global ticker/company search with automatic region inference.
- Historical OHLCV retrieval with Stooq-first no-key history where available.
- Public-source fundamentals, source records, warnings, and data quality scoring.
- Analysis tabs: Overview, Value Screen, Momentum, Cross-Analysis, Recommendation, Data Quality, Sources.
- Discovery screener with saved screen presets.
- Watchlist, portfolio, alerts, comparison, events, validation, account, and privacy workspaces.
- Local encrypted workspace storage, local account isolation, GDPR export/delete controls, audit history, and consent history.
- Page-active scheduled alerts plus a protected hosted-worker endpoint ready for external scheduler wiring.

## Quick Start

```bash
npm install
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

Optional local HTTPS:

```bash
npm run setup:https
npm run launcher
```

Then open:

```text
https://stockanalyser.app:3443
```

## Verification

Run the local quality gate before pushing changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

## Repository Structure

```text
app/                    Next.js App Router pages and API routes
src/components/          Main UI components
src/lib/                 Analysis, data, security, auth, workspace, and utility layers
src/lib/providers/       Provider-shaped adapters for public data sources
tests/                   Unit tests
e2e/                     Playwright browser tests
scripts/                 Local HTTPS and app launcher scripts
prd/                     Product requirement/reference PDFs
docs/                    Architecture, deployment, operations, and roadmap docs
.github/                 Issue templates, PR template, CI, and repo automation
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Security And Privacy Notes

The local build stores user workspace data under `.stock-analyser-data/` using encrypted local JSON. That directory, local certs, environment files, build output, and test artifacts are excluded from Git.

Do not commit:

- `.env` or `.env.*`
- `.stock-analyser-data/`
- `.certs/`
- `.cache/`
- `.next/`
- `node_modules/`

Before hosted production launch, replace local storage/auth with managed cloud services, tenant isolation, backup policy, provider-managed encryption, and documented GDPR processing controls.

## GitHub Workflow

Use the issue templates for bugs, feature requests, data-source gaps, and security hardening tasks. Use the pull request template for all changes so verification and data-integrity impact are visible.

CI runs typecheck, lint, unit tests, build, Playwright e2e, and dependency audit.

## License

No open-source license has been selected yet. Treat this repository as private/proprietary unless a license is added later.
