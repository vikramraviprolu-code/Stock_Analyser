# Stock Analyser User Guide

This guide explains how to use Stock Analyser from first launch through analysis, screening, watchlists, portfolios, alerts, validation, and privacy controls.

> This analysis is for informational purposes only and is not financial advice. Free-source market data may be delayed, incomplete, adjusted, stale, or unavailable. Investors should verify all data independently or consult a qualified financial advisor before making investment decisions.

## 1. Start the App

For local development:

```bash
npm install
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

For the local HTTPS launcher:

```bash
npm run setup:https
npm run launcher
```

Open:

```text
https://stockanalyser.app:3443
```

The local launcher is designed to keep the app available while the page is active. Hosted production deployment still needs a cloud database, production auth, and a hosted scheduler before it should be treated as always-on infrastructure.

## 2. Understand the Landing Page

The landing page opens into the main workspaces:

- Analyse: search for a stock and review the full analysis tabs.
- Discover: run public-source screens and save filter presets.
- Watchlist: track selected tickers.
- Portfolio: add holdings and refresh public-source prices.
- Alerts: create price, RSI, 52-week range, and momentum alerts.
- Compare: line up selected stocks side by side.
- Events: verify earnings dates from public sources where available.
- Validate: audit example ticker coverage and data availability.
- System: read the in-app guide and inspect readiness.
- Account: create or sign in to a local encrypted account.
- Privacy: export or delete local workspace data.

## 3. Analyse a Stock

1. Open Analyse.
2. Enter a ticker or company name, for example `AAPL`, `Deutsche Bank`, `RELIANCE.NS`, or `ASML.AS`.
3. Select the best match from the match strip.
4. Confirm the Region field is auto-detected.
5. Select Analyse.
6. Review each tab:

- Overview: price, range, valuation, company metadata, chart workbench, events, and status cards.
- Value Screen: checks whether the input stock and peers meet value criteria.
- Momentum: ranks peers by short-term momentum and technical signals.
- Cross-Analysis: compares peer setup, filters, and match logic.
- Recommendation: shows bull case, bear case, base case, catalysts, risks, rating, confidence, and time horizon.
- Data Quality: summarizes reliability gates, source mix, unavailable fields, and warnings.
- Sources: shows metric, value, source, URL, retrieval time, freshness, and confidence.

If a field cannot be verified, the app should show `Data unavailable` rather than invent a value.

## 4. Use Discovery

1. Open Discover.
2. Choose a preset: Balanced, Value Near Lows, Momentum Leaders, or High Quality.
3. Adjust filters such as region, minimum score, market cap, P/E, data quality, and warning filters.
4. Select Run Screen.
5. Use Table or Charts mode.
6. Open a row for analysis, add it to Watchlist, or add it to Compare.
7. Name a useful filter setup and select Save Screen.

Discovery uses public-source retrieval and may show fewer verified rows when sources are delayed or unavailable.

## 5. Manage Watchlists

1. Add stocks from an analysis toolbar, Discovery row, or Watchlist row.
2. Open Watchlist.
3. Select Refresh Watchlist to retrieve the latest public-source data.
4. Use Open to analyse an item.
5. Use Compare to add refreshed rows to the comparison matrix.
6. Use Remove to delete an item from the watchlist.

Watchlists are stored in the local workspace unless cloud sync is explicitly configured.

## 6. Track a Portfolio

1. Open Portfolio.
2. Enter ticker, region, quantity, average cost, currency, and optional notes.
3. Select Add Holding.
4. Select Load Portfolio or Refresh Prices.
5. Review market value, cost basis, unrealized P/L, and P/L percent.
6. Use Open to analyse a holding, or Remove to delete it.

Portfolio values depend on public-source latest close retrieval and may be delayed or unavailable.

## 7. Create Alerts

1. Open Alerts.
2. Enter ticker and region.
3. Choose a metric: Latest close, RSI 14D, % from low, or 5D performance.
4. Choose Above or Below.
5. Enter a numeric threshold.
6. Choose schedule: Hourly, Daily, or Manual.
7. Select Add Alert.
8. Use Evaluate Now for manual checks.
9. Use Run Due Checks for scheduled rules that are due.

Scheduled checks run while the app page is active. A hosted worker and strong bearer secret are required before relying on always-on server-side alert checks.

## 8. Compare Stocks

1. Add stocks to Compare from Discovery, Watchlist, or an analysis toolbar.
2. Open Compare.
3. Review total score, value score, momentum score, data confidence, price, market cap, P/E, momentum, RSI, signal, and warnings.
4. Open a stock for deeper analysis or remove it from the comparison.

The comparison matrix is intentionally capped so it stays readable.

## 9. Validate Coverage

1. Open Validate.
2. Choose PRD examples or Expanded universe.
3. Select Run Validation.
4. Review history status, fundamentals status, Stooq status, coverage, confidence, unavailable metrics, warnings, and history source links.

Use this workspace when you need to know whether the public-source coverage is strong enough for a ticker set.

## 10. Use System

The System workspace contains:

- App version and codename.
- Data mode and mock/live policy.
- Cloud sync and hosted worker readiness.
- A short in-app workflow guide.
- Data trust and recommendation rules.
- Security, GDPR, and readiness checklist cards.
- Pointers to the repo guide, test report, operations guide, and deployment guide.

Use System before a demo, release, or deployment to confirm the app is in the expected operating mode.

## 11. Account and Privacy

The local Account workspace supports local encrypted accounts and signed sessions. This is a local foundation, not a hosted identity provider.

Privacy controls include:

- Export Workspace JSON.
- Delete Workspace Data after typing `DELETE`.
- Audit trail.
- Consent history.
- Storage and encryption status.
- Deployment readiness for GDPR controls.

Do not commit local workspace data, certificates, environment files, keys, or secrets to the repository.

## 12. Data Quality Rules

Stock Analyser follows these rules:

- Prefer Stooq CSV for no-key historical OHLCV where available.
- Prefer official exchange and company IR pages for fundamentals when available.
- Use recognized finance sites only as public-source fallback.
- Show source URL, retrieval timestamp, freshness, and warnings.
- Show `Data unavailable` when a metric cannot be verified.
- Do not fabricate missing data.
- Do not mix mock and live data.

## 13. Troubleshooting

If the app does not open:

- Check whether the dev server is running.
- Try `http://127.0.0.1:3000`.
- For local HTTPS, ensure the launcher/proxy is running and certificates are installed.
- If a certificate warning appears, confirm the URL is `https://stockanalyser.app:3443` and not a mismatched host.

If analysis returns no data:

- Try selecting a specific match from the match strip.
- Try the primary listing suffix, for example `DBK.DE` instead of a plain company name.
- Check Sources and Data Quality for unavailable metrics or warnings.
- Use Validate to see whether the ticker has Stooq history and fundamentals coverage.

If alerts do not run:

- Confirm rules are enabled and not manual-only.
- Keep the app page open for local scheduled checks.
- Use Evaluate Now or Run Due Checks to test the rule.
- Configure the hosted worker before expecting always-on checks.

## 14. Safe Operating Checklist

Before sharing or deploying:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run test:e2e`.
- Run `npm audit --audit-level=moderate`.
- Review docs/TEST_REPORT.md.
- Review Privacy and System readiness warnings.
- Verify no sensitive files are staged.
