# Cloud Database Adapter

This document defines the first production storage target for Stock Analyser. The app still runs on local encrypted JSON by default; cloud storage must be explicitly configured and verified before production use.

## Status

Implemented in this foundation:

- Cloud workspace readiness checks.
- Sanitized database URL reporting.
- Provider-shaped workspace adapter contract.
- PostgreSQL schema migration for tenant-isolated workspace records.
- Row-level security policy template using `app.workspace_owner_id`.

Not yet implemented:

- Runtime database client dependency.
- Production auth provider integration.
- Data migration command from local encrypted JSON to cloud rows.
- Hosted backup/restore automation.

## Required Environment

```bash
STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud
STOCK_ANALYSER_DATABASE_URL=<postgresql-connection-url>
```

Optional local override:

```bash
STOCK_ANALYSER_DATA_DIR=.stock-analyser-data
```

Never commit `.env` files or database URLs containing credentials.

## Migration

Apply:

```text
database/migrations/0001_cloud_workspace.sql
```

The migration creates:

- `stock_analyser_schema_migrations`
- `workspace_owners`
- `workspace_items`
- `workspace_audit_log`

## Tenant Isolation

The schema enables PostgreSQL row-level security on workspace tables.

Application code should set the current owner for each transaction:

```sql
select set_config('app.workspace_owner_id', $1, true);
```

The `$1` value must be the resolved workspace owner id, for example:

```text
user:<production-subject-id>
```

## Workspace Item Strategy

Workspace domain objects are stored as JSONB records by kind:

- `watchlist_item`
- `portfolio_holding`
- `alert_rule`
- `alert_event`
- `alert_notification`
- `alert_scheduler_run`
- `privacy_consent`
- `privacy_consent_record`
- `audit_event`

This preserves the current local workspace contract while allowing future normalized tables if reporting needs grow.

## Readiness API

```text
GET /api/system/readiness
```

Cloud sync reports as configured only when:

- `STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud`
- `STOCK_ANALYSER_DATABASE_URL` is present
- the URL uses `postgres://` or `postgresql://`

The API never returns database credentials; it returns a sanitized URL only.

## Next Implementation Step

Add a production database client and implement the `WorkspaceAdapter` contract in `src/lib/cloud-workspace-adapter.ts`. Keep local encrypted JSON as fallback until migration and rollback are tested.
