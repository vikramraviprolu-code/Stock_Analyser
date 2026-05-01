# Stock Analyser Change History

This is the granular project change ledger. Use it alongside `VERSION_HISTORY.md`.

- `VERSION_HISTORY.md` tracks release-level product versions.
- `CHANGE_HISTORY.md` tracks implementation-level changes, files touched, rationale, and verification.

## Maintenance Rule

For every meaningful code or product change, add a new entry with:

- Date
- Change summary
- Why it changed
- Key files touched
- Verification performed
- Follow-up notes, if any

## 2026-05-02 - Repository Documentation Template

### Summary

Added a structured repository template so the GitHub repo is easier to understand, maintain, and contribute to. The update includes a full README, contribution guide, security policy, architecture/deployment/operations/roadmap docs, GitHub issue templates, a pull request template, CI workflow, and Dependabot configuration.

### Why

The app now has enough capability and release history that the repository needs a clear public-facing structure: how to run it, how to verify it, how to report data gaps, how to handle security, and how future changes should be reviewed.

### Key Files Touched

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS.md`
- `docs/ROADMAP.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/data_source_gap.yml`
- `.github/ISSUE_TEMPLATE/security_hardening.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- Secret-pattern scan over committed files showed no local certs, keys, tokens, or environment secrets.
- `git diff --check`

### Follow-Up

- Consider adding a license only after the desired distribution model is clear.
- Add repository topics and branch protection rules in GitHub settings.

## 2026-05-02 - Version 2.4.0 Hosted Worker Readiness

### Summary

Added the next production-readiness layer for cloud sync and always-on alerts. The app now has a protected hosted-worker endpoint that can be called by an external scheduler using a bearer secret, scans discovered workspace owners, and runs scheduled alert checks server-side. A readiness API and Privacy workspace section now show whether cloud sync and the hosted worker are actually configured.

### Why

Scheduled alerts from v2.3 only run while the page is active. The next step is to prepare a secure always-on execution path without pretending cloud infrastructure exists in the local build. This keeps production gaps visible while making the app ready for deployment wiring.

### Key Files Touched

- `src/lib/security.ts`
- `src/lib/workspace-store.ts`
- `src/lib/types.ts`
- `src/lib/version.ts`
- `src/components/StockAnalyser.tsx`
- `app/api/alerts/worker/route.ts`
- `app/api/system/readiness/route.ts`
- `tests/security.test.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`
- Live smoke: `GET /api/system/readiness` reports local encrypted storage, worker endpoint, security controls, GDPR controls, and missing cloud/worker configuration warnings.
- Live smoke: `GET /api/alerts/worker` reports the hosted worker is disabled until a strong worker secret is configured.
- Live smoke: `POST /api/alerts/worker` returns `503` without `STOCK_ANALYSER_WORKER_SECRET`, confirming the worker cannot run unauthenticated.
- Build note: Next/Turbopack still emits a non-fatal output-file-tracing warning for local filesystem workspace storage; the production build completes successfully.

### Follow-Up

- Provision a production database and replace the local encrypted workspace adapter with a tenant-isolated cloud adapter.
- Configure `STOCK_ANALYSER_WORKER_SECRET` and a hosted scheduler/cron provider before relying on always-on alert checks.
- Add operational observability for worker runs, failures, queue latency, and notification delivery.

## 2026-05-02 - Version 2.3.0 Scheduled Alerts

### Summary

Added scheduled alert support to the local workspace. Alert rules now support manual, hourly, and daily cadences; the app records rule evaluations, delivered notifications, scheduler runs, and cooldown-aware trigger events. The Alerts workspace now shows scheduler status, notification history, rule evaluation timestamps, and run history.

### Why

The PRD direction calls for Portfolio + Alerts + Cloud-synced Watchlists. The app already had persisted alert rules and on-demand evaluation; this version makes alerts closer to a usable monitoring workflow while staying honest that always-on delivery still needs a hosted background worker.

### Key Files Touched

- `src/lib/alert-engine.ts`
- `src/lib/types.ts`
- `src/lib/workspace-store.ts`
- `src/lib/version.ts`
- `src/components/StockAnalyser.tsx`
- `app/api/alerts/route.ts`
- `app/api/alerts/scheduler/route.ts`
- `tests/alert-engine.test.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`
- Live smoke: `GET /api/alerts` returns scheduler status, notifications, scheduler runs, and no mock data.
- Live smoke: `POST /api/alerts/scheduler` accepts a same-origin scheduled check and returns a run summary.

### Follow-Up

- Add a hosted scheduler/worker before claiming always-on notifications.
- Add user-configurable notification channels once the production auth/cloud provider is selected.
- Add notification read/archive actions and alert rule edit/pause controls.

## 2026-05-01 - Version 2.2.0 Auth Foundation

### Summary

Added local encrypted authentication and per-user workspace scoping. Users can create a local account, sign in, sign out, and see the active workspace-owner boundary from the new Account workspace. Workspace APIs now resolve the current signed session and store watchlists, portfolios, alerts, privacy settings, consent history, and audit events under that user’s encrypted workspace.
The release also includes a local account-deletion endpoint and Account workspace control that deletes the authenticated local account and its scoped workspace.

### Why

The next production-grade milestone is secure cloud sync. Before selecting a hosted provider, the app needs an identity boundary and workspace owner abstraction so cloud storage can replace the local adapter without changing the front-end workflows.

### Key Files Touched

- `src/lib/auth.ts`
- `src/lib/workspace-store.ts`
- `src/lib/types.ts`
- `src/lib/version.ts`
- `src/components/StockAnalyser.tsx`
- `app/api/auth/session/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/account/route.ts`
- `app/api/watchlist/route.ts`
- `app/api/portfolio/route.ts`
- `app/api/alerts/route.ts`
- `app/api/workspace/route.ts`
- `app/privacy/page.tsx`
- `tests/auth.test.ts`
- `e2e/app.spec.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`
- Live smoke: anonymous session reports `anonymous:local-default`.
- Live smoke: local account registration returns an authenticated session and httpOnly cookie.
- Live smoke: authenticated workspace export reports `syncScope: authenticated-local`.
- Live smoke: local account deletion clears the smoke-test account and scoped workspace.

### Follow-Up

- Replace the local auth store with a production identity provider before hosted multi-user launch.
- Replace local encrypted workspace files with a managed database using row-level access control, tenant isolation, backup retention, and provider-managed key rotation.
- Add account deletion across auth records, workspace records, cached exports, backups, and hosted audit logs once the cloud provider is selected.

## 2026-05-01 - Version 2.1.0 Trust Foundation

### Summary

Added the next trust milestone: encrypted local workspace storage, automatic plaintext migration, workspace audit events, privacy consent history, and a data reliability score that explains whether analysis output is fit to rely on.

### Why

The app already had a secure request/response baseline and GDPR-oriented controls. The next value step was to make stored workspace data safer and make data trust more transparent, especially before cloud sync and production user accounts are introduced.

### Key Files Touched

- `src/lib/workspace-crypto.ts`
- `src/lib/workspace-store.ts`
- `src/lib/data-reliability.ts`
- `src/lib/types.ts`
- `src/lib/analysis.ts`
- `src/lib/version.ts`
- `src/components/StockAnalyser.tsx`
- `app/privacy/page.tsx`
- `app/globals.css`
- `.gitignore`
- `tests/workspace-crypto.test.ts`
- `tests/data-reliability.test.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`
- Live smoke: `/api/workspace` export shows encrypted storage metadata.
- Live smoke: `/privacy` renders successfully with hardened headers.
- Live smoke: AAPL analysis response includes the new data reliability summary.

### Follow-Up

- Move from local encrypted JSON to authenticated hosted storage when a cloud provider is selected.
- Add row-level access control, managed key rotation, hosted audit logs, retention jobs, backup deletion, and user identity lifecycle events before production multi-user launch.
- Add scheduled alert execution once a hosted background worker is available.

## 2026-05-01 - Version 2.0.0 Secure Workspace

### Summary

Added a security and GDPR foundation for Stock Analyser. The app now applies framework-level response headers through the Next proxy, blocks untrusted API mutations, rate-limits API reads and writes, exposes workspace privacy controls, provides JSON export, supports typed-confirmation deletion, and documents local storage behavior through a Privacy Notice.

### Why

The user asked for GDPR compliance and the strongest practical security baseline. The implementation aligns the local app with OWASP-style application security controls while making GDPR-relevant user rights visible: transparency, access/export, portability, consent preferences, and erasure. Full legal compliance for a hosted product still requires a real cloud identity/storage provider, DPA, retention policy, and legal review.

### Key Files Touched

- `proxy.ts`
- `package.json`
- `app/api/workspace/route.ts`
- `app/privacy/page.tsx`
- `src/lib/security.ts`
- `src/lib/legal.ts`
- `src/lib/types.ts`
- `src/lib/workspace-store.ts`
- `src/lib/version.ts`
- `src/components/StockAnalyser.tsx`
- `app/globals.css`
- `tests/security.test.ts`
- `e2e/app.spec.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`
- API smoke test: cross-site workspace mutation returns `403`.
- API smoke test: same-origin workspace mutation returns `200`.
- Page smoke test: `/privacy` returns the hardened security headers.

### Follow-Up

- Replace local JSON storage with an authenticated cloud database before production multi-user use.
- Add provider-managed encryption, row-level access control, audit logs, data retention automation, backup deletion workflow, and a data processing agreement before storing real account data.
- Consider nonce-based production CSP once the deployment target is fixed, so inline script allowances can be removed.

## 2026-05-01 - Version 1.9.3 On-Demand URL Launcher

### Summary

Added and installed a macOS LaunchAgent-backed on-demand launcher for Stock Analyser. The launcher keeps the public local URLs available, starts the Next app when a page request arrives, proxies traffic to an internal managed port, and stops the managed app after the browser page closes or heartbeats expire.

### Why

The user wants the app to start automatically when opening the URL and close automatically when closing the page. A URL cannot wake a fully stopped app unless something lightweight remains listening, so this adds that resident listener while keeping the heavier Next process lifecycle-bound to active pages.

### Key Files Touched

- `scripts/on-demand-launcher.mjs`
- `scripts/install-launcher-agent.mjs`
- `src/components/StockAnalyser.tsx`
- `package.json`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `node --check scripts/on-demand-launcher.mjs`
- `node --check scripts/install-launcher-agent.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- Installed LaunchAgent at `/Users/vraviprolu/Library/LaunchAgents/app.stockanalyser.launcher.plist`
- Verified `http://127.0.0.1:3000/` and `https://stockanalyser.app:3443/` start the managed Next app on demand.
- Verified lifecycle `heartbeat`/`end` requests stop the managed Next app while leaving the lightweight launcher listening.

### Follow-Up

- Keep using the launcher URLs rather than running `npm run dev:local` manually for everyday use.
- Use `npm run launcher:uninstall` if the automatic local URL launcher should be removed.

## 2026-05-01 - Version 1.9.2 Live-Only Analysis

### Summary

Removed the mock fallback path from the app. The Analyse workspace no longer offers mock fallback, the client no longer retries with generated data after a failure, and the analysis builder no longer includes generated demo analysis.

### Why

The user wants the app to avoid mock fallback completely, so failed or unavailable public data should remain transparent rather than being replaced with synthetic values.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `app/api/analyse/route.ts`
- `src/lib/analysis.ts`
- `src/lib/source-quality.ts`
- `src/lib/types.ts`
- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `GET /api/analyse?ticker=AAPL&region=USA&demo=1` returns `400`
- Playwright visual smoke test of the Analyse search row at 2048px width.
- Confirmed no active `Mock`/`mock` references remain under `src`, `app`, `tests`, or `e2e`.

### Follow-Up

- Keep unavailable public-source metrics explicit as `Data unavailable` instead of substituting synthetic values.

## 2026-05-01 - Version 1.9.1 Analyse Search Alignment

### Summary

Reworked the Analyse search row so the ticker/company input, inferred region selector, mock fallback option, and action buttons sit in named layout zones instead of one stretched grid line.

### Why

The previous layout looked misaligned on wide desktop screens because the region helper text made that grid cell taller, pulling labels and controls out of visual rhythm.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- Playwright visual smoke test of the Analyse search row at 2048px width.

### Follow-Up

- Keep command surfaces grouped by task as additional workspace controls are added.

## 2026-05-01 - Version 1.9.0 Workspace Sync Pass

### Summary

Added Portfolio, Alerts, and server-synced Watchlists as first-class workspaces. This release introduces a server-side workspace store, API routes for watchlists/portfolio/alerts, persistent alert events, and landing/navigation updates.

### Why

The next PRD gap was moving from single-stock analysis into user workspace workflows: tracking holdings, monitoring rules, and keeping watchlists beyond one browser session. A true hosted sync still needs a database/auth provider, so this version uses a provider-shaped local server adapter that can be swapped cleanly later.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `src/lib/workspace-store.ts`
- `src/lib/types.ts`
- `app/api/watchlist/route.ts`
- `app/api/portfolio/route.ts`
- `app/api/alerts/route.ts`
- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- Live HTTPS response check on `https://stockanalyser.app:3443/`

### Follow-Up

- Replace the local JSON workspace adapter with authenticated hosted storage when a cloud provider is selected.
- Add background alert scheduling once the app is deployed with a persistent worker or cron-capable platform.

## 2026-05-01 - Version 1.8.3 Minimal Landing Pass

### Summary

Simplified the lower landing area by removing overlapping decorative elements, redundant proof chips, and long module-card descriptions, replacing the module area with compact launch tiles.

### Why

The desktop landing section still felt visually noisy: cards, chart bars, ticker strips, a floating score panel, proof chips, and disclaimer text were competing at the same time. The page needed a calmer, more focused launcher.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Live HTTPS DOM smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Consider replacing the remaining decorative chart bars with live mini chart data once a lightweight landing data summary is available.

## 2026-05-01 - Version 1.8.2 Landing UX Hierarchy Pass

### Summary

Reduced repeated landing actions on mobile, converted secondary CTAs to darker outline controls, tightened mobile hero typography, and aligned module buttons with the workstation visual system.

### Why

The landing page was readable after v1.8.1, but the first viewport still felt busy on narrow screens because the same actions appeared in both the top navigation and hero action cluster. The bright secondary buttons also pulled attention away from the primary action.

### Key Files Touched

- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Live HTTPS visual smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Consider a quick-analyse command input on the landing hero once the broader search flow is ready to be exposed there.

## 2026-05-01 - Version 1.8.1 Landing UX Contrast Patch

### Summary

Fixed the landing-page navigation contrast issue shown in the user screenshot and made the mobile landing actions more compact.

### Why

The landing navigation used a light button background while inheriting light text, making key actions nearly unreadable. The mobile layout also made the nav controls look too large and blocky.

### Key Files Touched

- `app/globals.css`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run lint`
- `npm run typecheck`
- Live HTTPS visual smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Continue scanning the landing page for contrast regressions at mobile and desktop viewport widths after future theme changes.

## 2026-05-01 - Version 1.8.0 Research Upgrade

### Summary

Added Chart Workbench v2, a research report builder/export path, and a nullable Fundamentals v2 field layer for deeper public-source analysis.

### Why

The app needed more professional analysis depth after the workstation upgrade: better chart controls, report output that preserves caveats and sources, and clearer visibility into which deeper fundamentals are available from free public sources.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `src/lib/types.ts`
- `src/lib/fundamentals.ts`
- `src/lib/analysis.ts`
- `src/lib/version.ts`
- `app/globals.css`
- `VERSION_HISTORY.md`
- `CHANGE_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- Live HTTPS smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Add downloadable CSV/XLSX exports for source records and peer tables.
- Continue improving official exchange/company IR extraction where stable no-key pages expose structured fields.

## 2026-05-01 - Add Persistent Change Ledger

### Summary

Added this durable change history file so implementation-level changes are recorded separately from release/version history.

### Why

The app already has version history, but future development also needs a finer-grained memory of what changed between versions, what files were touched, and what verification was run.

### Files Touched

- `CHANGE_HISTORY.md`
- `VERSION_HISTORY.md`

### Verification

- Documentation-only change; no app runtime verification required.

### Follow-Up

- Keep adding entries here for every meaningful implementation change.
- Keep `VERSION_HISTORY.md` reserved for release-level milestones.

## 2026-05-01 - Version 1.7.0 Workstation Upgrade

### Summary

Added a professional market workstation experience with stronger symbol resolution, richer match cards, saved screener screens, expanded screener controls, and a dark dense UI direction.

### Why

The user requested the next-level app upgrade while avoiding a restricted product term. The priority was to improve trust, usability, symbol reliability, and the professional workstation feel.

### Key Files Touched

- `src/lib/symbol-meta.ts`
- `src/lib/types.ts`
- `src/lib/tickers.ts`
- `src/lib/symbol-search.ts`
- `src/lib/stooq.ts`
- `src/components/StockAnalyser.tsx`
- `app/globals.css`
- `tests/tickers.test.ts`
- `e2e/app.spec.ts`
- `src/lib/version.ts`
- `VERSION_HISTORY.md`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- Live smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Add deeper chart interactions and keyboard shortcuts.
- Add exportable research reports tied to the source audit.
- Continue improving public-source fundamentals coverage by region.

## 2026-05-01 - Version 1.6.0 Console Baseline

### Summary

Added landing page, local HTTPS flow, lifecycle-aware proxy behavior, blank Analyse input, automatic region inference, and server-side symbol search.

### Why

The app needed a cleaner entry point, secure local URL behavior, better ticker/company matching, and a safer startup state where ticker/company is not prefilled.

### Key Files Touched

- `src/components/StockAnalyser.tsx`
- `src/lib/symbol-search.ts`
- `src/lib/tickers.ts`
- `src/lib/types.ts`
- `app/api/symbol-search/route.ts`
- `app/globals.css`
- `scripts/https-proxy.mjs`
- `scripts/setup-local-https.mjs`
- `tests/tickers.test.ts`
- `e2e/app.spec.ts`

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- Live smoke test on `https://stockanalyser.app:3443/`

### Follow-Up

- Preserve HTTPS lifecycle behavior while making restarts easy during development.
- Keep symbol search transparent about confidence and data source quality.
