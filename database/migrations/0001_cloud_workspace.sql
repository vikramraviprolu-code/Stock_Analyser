-- Stock Analyser cloud workspace schema v1.
-- Target: PostgreSQL-compatible managed database.
-- Apply this before enabling STOCK_ANALYSER_WORKSPACE_PROVIDER=cloud.

create table if not exists stock_analyser_schema_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

create table if not exists workspace_owners (
  owner_id text primary key,
  owner_type text not null check (owner_type in ('anonymous', 'user', 'service')),
  external_subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists workspace_items (
  owner_id text not null references workspace_owners(owner_id) on delete cascade,
  item_kind text not null check (
    item_kind in (
      'watchlist_item',
      'portfolio_holding',
      'alert_rule',
      'alert_event',
      'alert_notification',
      'alert_scheduler_run',
      'privacy_consent',
      'privacy_consent_record',
      'audit_event'
    )
  ),
  item_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, item_kind, item_id)
);

create index if not exists workspace_items_owner_kind_updated_idx
  on workspace_items(owner_id, item_kind, updated_at desc)
  where deleted_at is null;

create index if not exists workspace_items_payload_ticker_idx
  on workspace_items using gin ((payload -> 'ticker'))
  where deleted_at is null;

create table if not exists workspace_audit_log (
  id text primary key,
  owner_id text not null references workspace_owners(owner_id) on delete cascade,
  category text not null,
  action text not null,
  detail text not null,
  request_id text,
  actor_subject text,
  created_at timestamptz not null default now()
);

create index if not exists workspace_audit_log_owner_created_idx
  on workspace_audit_log(owner_id, created_at desc);

alter table workspace_owners enable row level security;
alter table workspace_items enable row level security;
alter table workspace_audit_log enable row level security;

drop policy if exists workspace_owners_owner_isolation on workspace_owners;
create policy workspace_owners_owner_isolation
  on workspace_owners
  using (owner_id = current_setting('app.workspace_owner_id', true))
  with check (owner_id = current_setting('app.workspace_owner_id', true));

drop policy if exists workspace_items_owner_isolation on workspace_items;
create policy workspace_items_owner_isolation
  on workspace_items
  using (owner_id = current_setting('app.workspace_owner_id', true))
  with check (owner_id = current_setting('app.workspace_owner_id', true));

drop policy if exists workspace_audit_log_owner_isolation on workspace_audit_log;
create policy workspace_audit_log_owner_isolation
  on workspace_audit_log
  using (owner_id = current_setting('app.workspace_owner_id', true))
  with check (owner_id = current_setting('app.workspace_owner_id', true));

insert into stock_analyser_schema_migrations (version, name)
values (1, 'cloud_workspace_foundation')
on conflict (version) do nothing;
