# Operations

## Routine Checks

Run before releasing:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

## Data Quality Checks

Use the app's Validate workspace to check:

- Example ticker coverage.
- History availability.
- Fundamentals availability.
- Source confidence.
- Warning volume.

For individual issues, inspect the Sources tab and source records before changing scoring logic.

## Alert Operations

Local scheduled alerts run while the page is active.

Hosted scheduled alerts require:

- `STOCK_ANALYSER_WORKER_SECRET`
- A trusted scheduler calling `/api/alerts/worker`
- Monitoring for failed worker responses

Recommended worker monitoring fields:

- `ownersScanned`
- `rulesChecked`
- `eventsCreated`
- `notificationsCreated`
- warning/error count

## Incident Checklist

If data looks wrong:

1. Check whether the metric is verified or `Data unavailable`.
2. Review the Sources tab.
3. Check public-source freshness.
4. Confirm ticker/region resolution.
5. Check cache state.
6. Avoid changing recommendation scoring until source integrity is understood.

If a security issue is suspected:

1. Stop exposing the affected route if needed.
2. Rotate relevant local or hosted secrets.
3. Check whether `.env`, `.certs`, or `.stock-analyser-data` were exposed.
4. Record the incident and fix in `CHANGE_HISTORY.md`.

## Local Data

Local workspace/auth data is stored under:

```text
.stock-analyser-data/
```

This directory is ignored by Git. Deleting it removes local accounts, local workspace data, keys, and encrypted workspace files.
