# Production self-host application-plane connection

This connection binds one attested immutable Flowcordia release to a release-confirmed migration phase, one web process, and one isolated proposal/index operations process on a single Docker Compose host.

| Source | Target | Why the connection exists | Failure behavior |
| --- | --- | --- | --- |
| Canonical release manifest and independent deployment digests | Migration, web, and operations roles | Keep every process on one application, upstream, image, runtime, and migration identity | Any mismatch blocks migration or startup before application work begins |
| Protected config, secrets, and manifest files | Deterministic topology validator | Separate non-secret deployment identity from credentials and prevent overlapping or committed configuration | Unsafe paths, modes, duplicate keys, placeholders, or incomplete dependencies produce BLOCKED |
| One-shot `migrate` service | Prisma, dashboard-agent Drizzle, and ClickHouse migration owners | Apply every repository-owned datastore transition exactly once before application replicas | Missing release confirmation, failed status/validation, or any datastore failure prevents web/operations startup |
| Migration completion | Operations service | Start proposal and workflow-index reconciliation against the selected schema before admitting HTTP traffic | Compose requires successful migration; operations local readiness must become fresh before the service is healthy |
| Operations service | Local pulse and durable database heartbeat | Detect both local event-loop liveness and installation-visible worker freshness | Missing/stale local pulse fails container health; missing durable heartbeat blocks live-dependency readiness |
| Operations readiness | Web service | Preserve worker-first rollout order for a release | Operator runbook starts and waits for operations before web; connected release remains blocked otherwise |
| Web service | Loopback host port and external HTTPS ingress | Keep the application container off public interfaces and place TLS/routing ownership outside the application plane | Default binding is loopback; unsafe public origins or missing HTTPS fail deterministic preflight |
| Immutable image | Read-only root filesystem | Prevent runtime mutation and drift across migration, web, and operations roles | Prisma runtime artifacts are packaged at build time; missing packaged artifacts fail published replica boot |
| External PostgreSQL, Redis, ClickHouse, Electric, object store, email, GitHub App, and inherited Trigger.dev execution plane | Flowcordia application plane | Reuse owned infrastructure rather than shipping unsafe development defaults | Topology validation checks bounded configuration; live/provider/connected gates prove actual reachability and behavior separately |

## Trust boundary

- The Compose file never bundles databases, provider credentials, TLS certificates, or Docker socket access.
- The secrets file remains outside the repository with owner-only permissions. Environment variables are still visible to the local container runtime administrator; external secret-store integration remains a later supported deployment mode.
- All services drop Linux capabilities, enable `no-new-privileges`, run as the image `node` user, use read-only root filesystems, and receive only a bounded writable `/tmp`; the migration service additionally receives one protected evidence directory.
- The manifest is mounted read-only with host-path creation disabled.
- Web is exposed only on loopback by default. Operations exposes no port.

## Ownership

- `docker/flowcordia-self-host.yml` owns the initial single-host application-plane topology and role ordering.
- `scripts/flowcordia-self-host-validate.ts` and the topology contract own static deployment validation.
- `docker/scripts/flowcordia-release-migrate.sh` owns release-confirmed datastore migration and bounded completion evidence.
- `docker/scripts/entrypoint.sh` owns migration isolation and inherited compatibility behavior.
- The proposal-worker lifecycle owns the local operations readiness pulse and graceful removal.
- The existing web `/healthcheck` owns HTTP readiness after release identity, plugins, and PostgreSQL checks.
- External dependencies, inherited execution workers, TLS ingress, backups, PITR, HA, and disaster recovery remain operator/inherited-platform responsibilities until separate supported contracts land.

## Deliberate exclusions

This connection proves one reproducible non-HA Flowcordia application plane. It does not prove multi-host scheduling, horizontal web/worker availability, managed database durability, provider SLAs, inherited execution-plane installation, zero-downtime schema changes, PITR, cross-region recovery, or public-beta readiness without protected connected evidence.
