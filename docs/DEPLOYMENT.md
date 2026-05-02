# Deployment

This project is currently optimized for local development and provider-ready production migration.

## Local Development

```bash
npm install
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

## Local HTTPS

```bash
npm run setup:https
npm run launcher
```

Open:

```text
https://stockanalyser.app:3443
```

## Required Production Work

Before hosted multi-user deployment:

- Implement and enable the cloud workspace adapter against a managed PostgreSQL database.
- Replace local passphrase auth with a production identity provider.
- Configure managed TLS through the hosting provider.
- Configure hosted scheduler/cron for `/api/alerts/worker`.
- Configure centralized logs and uptime monitoring.
- Define backup retention, restore process, and data deletion process.

## Environment Variables

| Variable | Purpose | Required For |
| --- | --- | --- |
| `STOCK_ANALYSER_WORKSPACE_KEY` | Optional local workspace encryption secret override | Local hardened operation |
| `STOCK_ANALYSER_AUTH_KEY` | Optional local auth/session secret override | Local hardened operation |
| `STOCK_ANALYSER_WORKER_SECRET` | Bearer secret for hosted alert worker, minimum 32 chars | Hosted scheduler |
| `STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud` | Enables cloud workspace readiness mode | Production cloud sync |
| `STOCK_ANALYSER_DATABASE_URL` | PostgreSQL connection URL for the future cloud adapter | Production cloud sync |
| `STOCK_ANALYSER_DATA_DIR` | Optional local data directory override | Local filesystem adapter |

Never commit environment files.

## Cloud Database Foundation

The current migration target is PostgreSQL:

```text
database/migrations/0001_cloud_workspace.sql
```

More detail:

```text
docs/CLOUD_DATABASE_ADAPTER.md
```

The readiness API reports cloud sync as configured only when the provider flag and a PostgreSQL-compatible database URL are present. Runtime workspace traffic remains on local encrypted JSON until the database client implementation and migration path are complete.

## Build And Test

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

## Hosted Alert Worker

The worker endpoint is:

```text
POST /api/alerts/worker
```

Headers:

```text
Authorization: Bearer <STOCK_ANALYSER_WORKER_SECRET>
Content-Type: application/json
```

Body:

```json
{ "force": false }
```

Use a scheduler interval that respects public-source rate limits. A 15-60 minute interval is a reasonable starting point for local/small hosted usage.

## Deployment Readiness API

```text
GET /api/system/readiness
```

Use this to verify cloud sync, worker auth, security controls, and GDPR controls before launch.
