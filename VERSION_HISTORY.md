# Stock Analyser Version History

This file is the durable project memory for product/version changes. Update it whenever a meaningful app capability, data source behavior, security behavior, or UI direction changes.

For implementation-level details, files touched, rationale, and verification notes, maintain `CHANGE_HISTORY.md`.

## 2.4.0 - Hosted Worker Readiness - 2026-05-02

- Added a protected `/api/alerts/worker` endpoint for hosted schedulers to run scheduled alert checks across discovered workspace owners.
- Added bearer-secret worker authentication with a 32-character minimum secret and a narrow proxy exception only for valid worker credentials.
- Added `/api/system/readiness` to report cloud-sync readiness, hosted-worker configuration, security controls, and GDPR controls.
- Added Privacy workspace readiness cards for cloud sync, hosted worker, worker endpoint, and remaining production gaps.
- Added local workspace-owner discovery so the hosted worker can evaluate multiple local user scopes before a cloud database adapter is connected.
- Added security regression coverage for hosted worker authorization and weak-secret rejection.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, dependency audit, and live readiness/worker API smoke tests.

## 2.3.0 - Scheduled Alerts - 2026-05-02

- Added alert schedules for manual, hourly, and daily rule evaluation.
- Added a reusable alert engine for due-rule checks, cooldown enforcement, alert events, delivered notifications, and scheduler run history.
- Added `/api/alerts/scheduler` for local scheduled alert checks while the app page is active.
- Extended the Alerts workspace with scheduler status cards, schedule selection, notification history, rule evaluation timestamps, and scheduler run history.
- Preserved notification and scheduler history when alert rules are removed or migrated from older workspaces.
- Added unit coverage for alert schedule timing, due-rule detection, threshold triggering, and scheduler status summaries.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, dependency audit, and live alert scheduler API smoke testing.

## 2.2.0 - Auth Foundation - 2026-05-01

- Added local encrypted account creation, sign-in, sign-out, and session status APIs.
- Added local account deletion with scoped workspace erasure.
- Added scrypt passphrase hashing, encrypted auth-store records, and signed httpOnly session cookies.
- Added per-user workspace scoping so signed-in users get isolated encrypted watchlists, portfolios, alerts, privacy settings, consent history, and audit events.
- Added an Account workspace to manage the local session and show workspace-owner/sync readiness.
- Updated workspace APIs for watchlist, portfolio, alerts, and privacy export/delete to use the current session owner.
- Updated the Privacy Notice with account-security details.
- Added auth foundation unit coverage and e2e coverage for the Account workspace.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, dependency audit, and auth/workspace/account-deletion smoke tests.

## 2.1.0 - Trust Foundation - 2026-05-01

- Upgraded the local workspace store from plaintext JSON to encrypted JSON using AES-256-GCM with a local owner-only key file or environment secret.
- Added automatic plaintext workspace migration on first workspace read/write after upgrade.
- Added workspace audit events for watchlist, portfolio, alert, privacy, and system changes.
- Added consent history tracking for optional privacy preferences.
- Added a data reliability scoring layer that combines source confidence, metric coverage, history depth, regional-filter verifiability, and warning pressure.
- Updated Data Quality and Privacy workspaces to show reliability gates, encryption status, retention posture, consent history, and audit evidence.
- Added `.stock-analyser-data/` to `.gitignore` so local keys and encrypted workspace artifacts are not source-controlled.
- Added unit tests for encrypted workspace JSON and data reliability scoring.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, dependency audit, live workspace/privacy API smoke tests, and live AAPL analysis reliability smoke test.

## 2.0.0 - Secure Workspace - 2026-05-01

- Added a Next proxy security layer for CSP, clickjacking protection, MIME-sniffing prevention, referrer privacy, permissions lockdown, origin isolation, HSTS, and API no-store behavior.
- Added API mutation protections for same-origin/same-site requests, request-size limits, and per-client read/write rate limits.
- Added GDPR-oriented workspace controls: Privacy workspace, Privacy Notice page, consent flags, workspace JSON export, and typed-confirmation workspace deletion.
- Extended the server workspace store with export/delete functions and explicit local-vs-cloud storage metadata.
- Added security regression tests and e2e coverage for the Privacy workspace.
- Restored the project manifest so security/build/test commands are reproducible.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, API security smoke tests, and dependency audit.

## 1.9.3 - Workspace On-Demand Launcher - 2026-05-01

- Added a local on-demand launcher that keeps `http://127.0.0.1:3000/` and `https://stockanalyser.app:3443/` available.
- The launcher starts the managed Next app only when the URL is opened, using an internal target port.
- The browser heartbeat now reports to the current local origin so the launcher can detect active pages.
- The managed Next app stops automatically after the final page closes or heartbeats expire, while the lightweight launcher remains ready for the next open.
- Added a macOS LaunchAgent installer so the launcher starts automatically at login.
- Installed and verified the LaunchAgent on this machine.
- Verified with syntax checks, typecheck, lint, unit tests, production build, e2e, and lifecycle smoke testing.

## 1.9.2 - Workspace Live-Only Analysis - 2026-05-01

- Removed the mock fallback control from the Analyse command row.
- Removed client-side fallback to generated demo analysis after live public-source failures.
- Removed generated mock analysis data from the analysis builder and source-quality model.
- Rejected the legacy demo query path so analysis remains live public-source only.
- Further simplified the Analyse search row after removing the fallback option.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, API rejection check, and visual smoke testing.

## 1.9.1 - Workspace Search Alignment - 2026-05-01

- Realigned the Analyse command row into explicit query, region, option, and action zones.
- Reduced the vertical height and visual drift in the search panel.
- Shortened the auto-region helper and mock fallback label for a cleaner workstation UI.
- Verified with typecheck, lint, production build, Playwright e2e, and visual smoke testing.

## 1.9.0 - Workspace - 2026-05-01

- Added server-persisted watchlist sync with migration from the previous local browser watchlist.
- Added a Portfolio workspace for holdings, cost basis, latest verified public close, market value, and unrealized P/L.
- Added an Alerts workspace for price, RSI, 52-week range, and 5D momentum rules with on-demand evaluation and event history.
- Added backend workspace store APIs for watchlists, portfolio holdings, and alerts using a local server JSON adapter that can be swapped for a hosted database.
- Updated the landing page and workspace navigation to expose Portfolio and Alerts.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, and live HTTPS response check.

## 1.8.3 - Research Minimal Landing - 2026-05-01

- Minimalised the lower landing section by replacing large descriptive module cards with compact launch tiles.
- Removed overlapping decorative ticker strips, the floating score card, and redundant proof-chip row.
- Kept a subdued market-chart background as the only landing visual accent.
- Kept the mandatory disclaimer visible while reducing its visual weight.
- Verified with lint, typecheck, production build, and live HTTPS DOM smoke testing.

## 1.8.2 - Research UX Hierarchy - 2026-05-01

- Reduced duplicated landing-page actions on small screens by hiding the top action cluster and keeping the primary hero action set.
- Reworked secondary landing CTAs from bright slabs into restrained outline controls for a more focused first viewport.
- Tightened mobile hero typography and CTA wrapping so key actions fit with less vertical drag.
- Updated landing module buttons to match the dark workstation UI direction.
- Verified with lint, typecheck, production build, and live HTTPS visual smoke testing.

## 1.8.1 - Research UX Patch - 2026-05-01

- Fixed low-contrast landing-page navigation buttons where light text was rendered on light button backgrounds.
- Made the landing navigation more compact on smaller viewports so the top actions read as controls instead of oversized blank blocks.
- Corrected the light signal card text color for readability.
- Verified with lint, typecheck, and live HTTPS visual smoke testing.

## 1.8.0 - Research - 2026-05-01

- Added Chart Workbench v2 with 1M/3M/6M/1Y ranges, line/candle modes, moving-average overlays, and selectable RSI/ROC/Volume indicator panels.
- Added a research report builder that previews the investment note and exports a self-contained HTML report alongside print/PDF export.
- Extended the fundamentals layer with public-source nullable fields for revenue, EPS, margins, returns, leverage, cash flow, yield, growth, and beta.
- Added Fundamentals v2 coverage in the overview so unavailable public-source metrics remain explicitly visible.
- Expanded analysis history rows retained for charting from 120 to 260 where the public history source provides enough data.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, and live HTTPS smoke testing.

## 1.7.0 - Workstation - 2026-05-01

- Added a stronger symbol reliability layer with company aliases, exchange suffix metadata, Stooq candidate mapping, confidence scores, primary-listing hints, and match warnings.
- Added richer ticker/company match cards showing region, exchange, confidence, listing quality, and preferred Stooq candidate.
- Introduced the Global Market Workstation UI direction: darker, denser, data-forward layout with status strip, source confidence, history rail, watchlist state, compare state, and screener state.
- Expanded Screener v2 with saved screens, custom screen names, min data quality, min market cap, source-clean filtering, sort field, and sort direction.
- Added regression coverage for alias-driven symbol matching and kept e2e coverage for blank input plus auto-region selection.
- Verified with typecheck, lint, unit tests, production build, Playwright e2e, and live HTTPS smoke testing.

## 1.6.0 - Console - 2026-05-01

- Added landing page entry into the analyser workspace.
- Enabled local HTTPS access through `https://stockanalyser.app:3443/` using the local TLS proxy and certificate flow.
- Added lifecycle-aware HTTPS proxy behavior so the proxy can exit after the active webpage closes.
- Fixed certificate common-name flow by using the local `stockanalyser.app` hostname.
- Improved Deutsche Bank lookup by supporting `DBK.DE` and company-name matching.
- Changed the Analyse input to start empty and added automatic region inference from ticker/company matches.
- Added `/api/symbol-search` for server-side no-key public symbol lookup with seeded fallback.

## 1.5.0 - Global Equity Terminal PRD Base - 2026-04-30

- Implemented core Next.js + TypeScript Stock Analyser app structure.
- Added tabs for Overview, Value Screen, Momentum, Cross-Analysis, Recommendation, Data Quality, and Sources.
- Added Stooq-first historical OHLCV retrieval with public fallback behavior.
- Added core technical metrics: latest close, 52-week high/low, percent from low, average volume, 5D performance, moving averages, RSI, and ROC.
- Added public-source fundamentals retrieval, source records, freshness, warnings, and mock demo fallback labeling.
- Added regional filters, peer matching, recommendation scoring, watchlist, compare, events, validation, and test coverage.
