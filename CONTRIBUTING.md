# Contributing

Thanks for improving Stock Analyser. The main rule is simple: keep the app honest about data quality and never hide uncertainty.

## Development Flow

1. Create or pick a GitHub issue.
2. Create a focused branch.
3. Make the smallest coherent change.
4. Run the verification gate.
5. Open a pull request using the PR template.

## Local Setup

```bash
npm install
npm run dev:local
```

Local URL:

```text
http://127.0.0.1:3000
```

## Quality Gate

Run before opening a PR:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

If a command cannot be run, document why in the PR.

## Data Rules

- Do not use paid APIs unless the product decision changes and the PR documents the change.
- Do not fabricate unavailable metrics.
- Show `Data unavailable` when a metric cannot be verified.
- Keep source URL, retrieval timestamp, freshness, and warnings visible where relevant.
- Prefer official exchange/company IR pages, then recognized finance sites.
- Avoid mixing mock/demo data with live data.

## Security Rules

- Never commit secrets, certificates, local keys, local workspace data, cache output, or `.env` files.
- Keep mutation routes protected by same-origin checks or explicit service authentication.
- Update tests when changing auth, workspace storage, alerts, or security behavior.
- Keep GDPR export/delete behavior intact when adding user-entered data.

## Documentation Rules

Update these when behavior changes:

- `VERSION_HISTORY.md` for release-level changes.
- `CHANGE_HISTORY.md` for implementation-level changes.
- `docs/` when architecture, deployment, or operations change.
