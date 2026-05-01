# Roadmap

## Done

- Global public-source stock analysis.
- Stooq-first history layer.
- Technical indicators and transparent scoring.
- Data quality, source records, and warning surfaces.
- Landing page and market workstation UI.
- Watchlists, portfolio, alerts, compare, events, validate, auth, and privacy workspaces.
- Local encrypted workspace storage.
- Local account isolation.
- GDPR export/delete controls.
- Page-active scheduled alerts.
- Hosted alert worker readiness.
- GitHub repo with documentation and issue/PR templates.

## Next Priority

### 1. Cloud Database Adapter

Replace local encrypted JSON with tenant-isolated hosted storage for:

- Users
- Watchlists
- Portfolios
- Alert rules, events, notifications, scheduler runs
- Consent history
- Audit events

### 2. Production Auth

Move from local passphrase auth to a managed identity provider with:

- Email/password or passkey-ready flows
- Password reset
- MFA-ready sessions
- Tenant isolation
- Session revocation

### 3. Hosted Scheduler

Connect `/api/alerts/worker` to a production cron/job provider.

### 4. Notification Center V2

Add:

- Read/archive actions
- Severity labels
- Rule edit/pause controls
- Delivery channels after consent and unsubscribe controls exist

### 5. Data Coverage Hardening

Improve:

- Company-name matching
- Global ticker resolution
- Peer discovery
- Official-source ranking
- Source freshness and warning clarity

## Later

- Portfolio allocation charts.
- Risk and concentration analytics.
- Import/export of watchlists and portfolios.
- Role-based team workspaces.
- Hosted observability dashboard.
