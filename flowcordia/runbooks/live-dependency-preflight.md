# Flowcordia live dependency preflight

The live dependency preflight is a non-destructive operator gate that runs after configuration validation and deployment preparation. It verifies that Flowcordia can reach its PostgreSQL writer, that the database migration history exactly matches the checked-out release artifact, that GitHub accepts the configured App identity, and—when required—that the dedicated proposal operations worker has a current durable heartbeat.

It performs bounded reads only. It does not create installation tokens, inspect repository contents, mutate GitHub, publish events, apply migrations, start workers, enable Studio, deploy tasks, or execute workflows.

## Profiles

| Profile | Live checks |
| --- | --- |
| `web` | PostgreSQL writer, exact migration set, GitHub App authentication |
| `worker` | PostgreSQL writer, exact migration set, GitHub App authentication, durable proposal-worker heartbeat |
| `release` | Every web and worker live check |

The command runs the deterministic installation preflight first. If configuration is blocked, no network request or database connection is attempted.

## Run the gate

Human-readable output:

```bash
pnpm exec tsx scripts/flowcordia-live-preflight.ts --profile web
pnpm exec tsx scripts/flowcordia-live-preflight.ts --profile worker
pnpm exec tsx scripts/flowcordia-live-preflight.ts --profile release
```

Machine-readable output:

```bash
pnpm exec tsx scripts/flowcordia-live-preflight.ts --profile release --json
```

When global Studio rollout is intentional, the same explicit acknowledgement used by configuration preflight is required:

```bash
pnpm exec tsx scripts/flowcordia-live-preflight.ts \
  --profile release \
  --allow-global-studio
```

Exit codes:

- `0` — configuration and every required live dependency check are `READY`;
- `1` — configuration or live dependency evidence is `BLOCKED` or `UNAVAILABLE`;
- `2` — command usage is invalid.

## Database boundary

The database probe:

1. creates one bounded Prisma writer connection with a connection limit of one and short connection/pool timeouts;
2. executes `SELECT 1`;
3. reads only migration name and terminal-state columns from `_prisma_migrations`;
4. compares successful, non-rolled-back database migrations to the exact migration directories shipped in the checked-out repository;
5. blocks missing, extra, unfinished, malformed, or incompatible migration history;
6. reads only `observedAt` and `healthyUntil` for the singleton `proposal-operations` heartbeat when the selected profile requires a worker.

Migration names, database URLs, hosts, users, timestamps, query errors, and provider responses never enter the projection.

An exact migration match is intentionally strict. A database newer than the checked-out application is blocked because application rollback across an incompatible schema is unsafe.

## GitHub App boundary

The GitHub probe creates a short-lived RS256 application JWT in memory and calls GitHub's application identity endpoint. It does not request an installation token or repository permission.

- HTTP `200` is `READY`.
- Authentication and identity rejection are `BLOCKED`.
- timeout, transport failure, rate limiting, and server-side failure are `UNAVAILABLE`.

The response body is never parsed, returned, logged, or preserved. The JWT and private key stay process-local.

## Worker heartbeat boundary

Worker and release profiles require the durable heartbeat written by the dedicated proposal operations worker. The check blocks when the record is missing, expired, internally unordered, or materially ahead of the operator clock. A database read failure is `UNAVAILABLE`.

This proves only that the worker recently persisted its liveness record. The authenticated project-scoped operations-readiness command remains authoritative for proposal backlog, outbox, reconciliation, leases, and recent failure state.

## Verification boundary

The source implementation has passed 15 focused installation and dependency tests covering fixed projections, redaction, exact migration parity, GitHub App JWT authentication classification, database failure handling, worker heartbeat expiry and clock skew, and the blocked-before-network CLI path. Prisma generation and the complete monorepo typecheck also passed on one exact product branch before temporary validation tooling removed itself.

That evidence proves the command and contracts. It does not claim that any deployed PostgreSQL instance, GitHub App, or proposal worker has returned `READY`. A real operator run in the configured environment remains mandatory and must be tied to the exact application and migration artifact being released.

## Deployment sequence

1. Build web and worker images from one exact Flowcordia commit.
2. Run deterministic `web`, `worker`, and `release` configuration preflights.
3. Create the required versioned database backup and complete its isolated restore rehearsal.
4. Apply migrations through one controlled migration owner.
5. Deploy the dedicated proposal operations worker.
6. Run live preflight with profile `worker`; wait for a current heartbeat.
7. Deploy the request-serving web application.
8. Run live preflight with profile `web`, then profile `release` against the exact release environment.
9. Run authenticated repository readiness and project-scoped operations readiness.
10. Continue through private-beta author acceptance and connected preview, promotion, production, and rollback evidence.

## Failure and recovery

- `BLOCKED` stops rollout until the incompatible or rejected dependency state is corrected.
- `UNAVAILABLE` never degrades to success. Recheck after diagnosing connectivity or provider availability.
- The command does not retry mutations because it performs no mutation.
- Do not apply migrations automatically to make the migration check pass. Review and run the controlled migration procedure.
- Do not create duplicate worker loops to make heartbeat appear healthy. Repair the dedicated worker and verify durable operations state.
- Do not rotate or print the GitHub private key through the preflight command. Update the secret through the deployment system, then rerun configuration and live checks.

## Evidence boundary

The schema `0.1` result contains only profile, phase, fixed check keys, READY/BLOCKED/UNAVAILABLE states, fixed messages, and a timestamp. It excludes environment values, URLs, hosts, database or installation IDs, migration names, heartbeat timestamps, tokens, provider bodies, raw errors, and stack traces.

A passing live preflight is required operational evidence. It does not replace repository CI, repository readiness, operations readiness, connected acceptance, backup restore proof, or disaster recovery testing.
