# Flowcordia installation preflight

The installation preflight is a deterministic, read-only configuration gate for Flowcordia web, proposal-worker, and release deployments. It validates configuration shape and safe rollout defaults before migrations, network calls, or connected acceptance.

It does not connect to PostgreSQL, GitHub, Trigger.dev, object storage, email, or the event endpoint. A passing preflight is necessary but never sufficient for production acceptance.

## Profiles

| Profile | Intended deployment | Checks |
| --- | --- | --- |
| `web` | Request-serving web application | pinned Node.js runtime, PostgreSQL URLs, application revision, GitHub App shape, web secrets, origins, environment mode, Studio rollout |
| `worker` | Dedicated proposal operations worker | pinned Node.js runtime, PostgreSQL URLs, application revision, GitHub App shape, worker enablement, event delivery, bounded timing and lease relationships |
| `release` | One complete release candidate | every web and worker check with production-only origins and environment modes |

## Run the gate

Human-readable output:

```bash
pnpm exec tsx scripts/flowcordia-installation-preflight.ts --profile web
pnpm exec tsx scripts/flowcordia-installation-preflight.ts --profile worker
pnpm exec tsx scripts/flowcordia-installation-preflight.ts --profile release
```

Machine-readable output:

```bash
pnpm exec tsx scripts/flowcordia-installation-preflight.ts --profile release --json
```

Exit codes:

- `0` — every configuration check is `READY`;
- `1` — one or more checks are `BLOCKED`;
- `2` — command usage is invalid.

The JSON schema is version `0.1`. It contains only profile, fixed check keys, fixed messages, states, and a timestamp. It never includes environment values.

## Global Studio override

The safe default is `FLOWCORDIA_STUDIO_ENABLED=0` or unset while one internal organization is enabled through the organization feature flag. A release preflight blocks global Studio access unless the operator deliberately supplies:

```bash
pnpm exec tsx scripts/flowcordia-installation-preflight.ts \
  --profile release \
  --allow-global-studio
```

This flag acknowledges configuration only. It does not bypass application authorization, organization features, repository readiness, operations readiness, or connected acceptance.

## Fresh installation sequence

1. Select one exact Flowcordia commit and build every web and worker image from that revision.
2. Use the repository-pinned Node.js `20.20.2` and pnpm `10.33.2` toolchain.
3. Configure separate web and proposal-worker deployments. Do not enable the proposal loop on every request-serving replica.
4. Run the `web` preflight against the web deployment environment.
5. Run the `worker` preflight against the worker deployment environment.
6. Run the `release` preflight against the combined release configuration and preserve the sanitized JSON result.
7. Create and verify a PostgreSQL backup before applying migrations.
8. Apply repository migrations once through the documented migration owner. Do not let every replica race migration deployment.
9. Deploy the dedicated worker and confirm its durable heartbeat becomes active.
10. Deploy the web application and keep global Studio access disabled during internal rollout.
11. Run the authenticated repository-readiness and operations-readiness checks.
12. Complete the connected release acceptance sequence and assemble the exact-lineage evidence manifest.

## Upgrade sequence

1. Record the current application commit, image versions, database migration state, and worker deployment identity.
2. Run the current release preflight and resolve existing blocked configuration before changing code.
3. Build the candidate web and worker images from one exact new commit.
4. Run the candidate `web`, `worker`, and `release` preflights without printing environment values.
5. Take and verify a restorable database backup.
6. Review migration compatibility and the release notes for the exact version transition.
7. Apply migrations using one controlled migration job.
8. Upgrade the dedicated proposal worker, confirm heartbeat and queue health, then upgrade request-serving web replicas.
9. Run repository readiness, operations readiness, private-beta author acceptance, connected preview, promotion, production, and rollback evidence as required by the maturity gate.
10. Accept the upgrade only after the exact final application head has preserved evidence.

## Failure and recovery

- A blocked preflight stops deployment before migrations or service mutation.
- The preflight never retries, edits configuration, writes files, or contacts providers.
- A database migration failure follows the migration-specific recovery plan. Do not invent a generic down migration.
- An application rollback must use an image compatible with the already-applied database schema.
- If compatibility cannot be proven, restore through the tested backup and recovery procedure rather than deleting migration records.
- A worker failure must be diagnosed through durable heartbeat, outbox, reconciliation, lease, and proposal health. Do not enable duplicate loops as a shortcut.
- A passing preflight cannot override a failed repository-readiness, operations-readiness, provider, production, or rollback check.

## Secret boundary

The evaluator reads configuration in process memory only to validate shape. Projection messages never include values, lengths, hosts, IDs, URLs, keys, or partial secrets. Do not attach shell environments, command traces, `.env` files, or raw CI logs to release evidence.
