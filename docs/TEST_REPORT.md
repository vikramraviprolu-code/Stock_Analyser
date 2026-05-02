# Stock Analyser Test Report

Date: 2026-05-02

App version: 2.6.0

Scope: QA hardening for core calculations, public API health/security behavior, workspace navigation, button/control availability, validation states, and the new System guide workspace.

## Summary

Result: Passed with one documented build warning.

The QA pass expanded automated coverage across pure calculation helpers, source/trust helpers, symbol metadata, form accessibility, workspace navigation, button/control states, and API readiness/security boundaries. The app now also includes an in-app System guide and a repo-level user guide.

## Automated Test Matrix

| Area | Coverage |
| --- | --- |
| Technical indicators | Moving averages, RSI, ROC, 52-week high/low, average volume, aggregate metrics |
| Regional filters | Region detection, thresholds, unavailable filter warnings |
| Recommendation scoring | Value, momentum, data quality, final rating |
| Source quality | Verification labels, confidence scoring, warning penalties |
| Security | CSP, origin checks, rate limiting, API mutation protection, worker secret handling |
| Auth and workspace crypto | Local auth validation, encrypted workspace envelope behavior |
| Cloud workspace readiness | Database URL detection, required env checks, sanitized URL handling |
| UI navigation | Landing launch buttons and workspace navigation |
| UI controls | Analyse, Discover, Watchlist, Portfolio, Alerts, Compare, Events, Validate, System, Account, Privacy |
| API smoke | Readiness, alerts worker auth boundary, invalid history validation |

## Issues Found and Corrected

| Issue | Status | Fix |
| --- | --- | --- |
| No user-facing System guide workspace existed. | Fixed | Added a System workspace with workflow guide, trust rules, readiness cards, and repo doc pointers. |
| Landing/workspace navigation did not expose System. | Fixed | Added System to landing tiles, landing actions, top action cluster, and product navigation. |
| Test coverage did not exercise all major workspace buttons and controls. | Fixed | Expanded Playwright coverage across workspace panels, key buttons, form validation states, mobile layout, and API smoke checks. |
| Repo lacked a user-friendly operating guide. | Fixed | Added docs/USER_GUIDE.md and linked it from README/System guidance. |
| Portfolio, Alerts, Auth, and Privacy form labels were visually present but not consistently programmatically associated with inputs. | Fixed | Added accessible labels to the relevant inputs and selects so browser tests and assistive technologies can target them reliably. |
| Initial e2e expectations had ambiguous button locators. | Fixed | Tightened locators to exact/scoped button names and allowed the expected CSRF-level `403` worker response. |

## Verification Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | TypeScript check passed. |
| `npm run lint` | Passed | ESLint passed. |
| `npm test` | Passed | 14 test files, 61 tests passed. |
| `npm run build` | Passed with warning | Production build completed. Turbopack emitted the known non-fatal NFT tracing warning for local filesystem workspace storage. |
| `npm run test:e2e` | Passed | 14 Playwright tests passed across desktop and mobile projects. |
| `npm audit --audit-level=moderate` | Passed | 0 vulnerabilities found. |
| In-app browser QA | Passed | Confirmed System entry, System guide render, 11 workspace nav buttons, and accessible Alerts Schedule control. |

## Button and Workflow Coverage

- Landing: Analyse, Discover, Portfolio, Alerts, Account, Privacy, Events, Validate, System.
- Workspace nav: Analyse, Discover, Watchlist, Portfolio, Alerts, Compare, Events, Validate, System, Auth, Privacy.
- Analyse: empty input disabled state, Refresh Data disabled state, company-name match selection, automatic region inference.
- Discover: preset selection, saved screen creation, table/chart toggle.
- Portfolio: Add Holding validation error for missing ticker.
- Alerts: Add Alert validation error for missing ticker, Schedule select accessibility and value change.
- Account: Sign In and Create Account presence.
- Privacy: Delete Workspace disabled/enabled typed confirmation.
- API: readiness payload, hosted worker status, unauthorized worker boundary, invalid history request.

## Residual Risks

- Free public-source data can be delayed, blocked, stale, adjusted, or unavailable.
- E2E tests avoid depending on live market retrieval where possible to reduce flakiness.
- Cloud database runtime, production auth, and always-on hosted scheduler remain roadmap items until credentials and infrastructure are selected.
- The build warning should be cleaned up when the local encrypted JSON adapter is replaced or statically scoped for hosted production.
