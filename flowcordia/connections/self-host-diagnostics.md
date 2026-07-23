# Self-host diagnostics connection

This connection binds one exact published Flowcordia image and release manifest to non-mutating installation diagnostics and a sanitized support artifact.

| Source | Target | Why the connection exists | Failure behavior |
| --- | --- | --- | --- |
| Canonical release manifest plus independent deployment digests | Shared release-contract module | Keep startup verification and diagnostics on one exact parser and identity rule | Unknown fields, malformed identity, changed file, digest mismatch, mixed components, or wrong runtime blocks diagnostics |
| `flowcordia doctor` | PostgreSQL and `_prisma_migrations` | Prove database reachability and exact successful release migration inventory without reading tenant rows | Connection failure, incomplete/rolled-back migration, count mismatch, or checksum mismatch is UNAVAILABLE |
| `flowcordia doctor` | Durable operations heartbeat | Prove the separately deployed proposal/index worker remains alive for operations/release profiles | Missing or expired singleton heartbeat is UNAVAILABLE |
| Operations-profile doctor | Process-local readiness pulse | Prove the exact-revision worker event loop is still refreshing local readiness | Missing, stale, malformed, symlinked, oversized, or wrong-revision pulse is UNAVAILABLE |
| `flowcordia doctor` | Redis | Prove configured authentication and queue transport readiness with one PING | Authentication, TLS, connection, timeout, or response failure is UNAVAILABLE |
| `flowcordia doctor` | ClickHouse | Prove query transport with one bounded `SELECT 1` | Invalid URL, authentication, timeout, non-2xx response, or unexpected body is UNAVAILABLE |
| `flowcordia doctor` | Electric | Prove the configured endpoint completes a bounded TCP/TLS connection | DNS, TLS verification, connection, or timeout failure is UNAVAILABLE |
| `flowcordia doctor` | S3-compatible object store | Prove bucket access using one HEAD request without object mutation | Missing credentials/configuration, authentication, authorization, TLS, timeout, or bucket failure is UNAVAILABLE |
| `flowcordia doctor` | Product-email configuration | Reject console/null or incomplete configured transports without sending email | Unsupported or incomplete transport is UNAVAILABLE; actual delivery remains provider-readiness evidence |
| `flowcordia doctor` | GitHub App API | Authenticate one short-lived RS256 JWT and compare exact App ID/slug | Key, JWT, network, API, or identity mismatch is UNAVAILABLE; installation permissions remain repository-readiness evidence |
| `flowcordia doctor` | Internal and public web health | Prove the selected web process and advertised HTTPS origin serve health directly | Invalid/non-HTTPS origin, redirect, timeout, or non-success response is UNAVAILABLE |
| Diagnostics Compose service | Healthy web and operations services | Run one release-level diagnostic only after both application roles are healthy | Compose does not start diagnostics before both health conditions succeed |
| Bounded diagnostics projection | Protected host diagnostics directory | Preserve one reviewable point-in-time support artifact without secrets or overwrite | Unsafe path, existing target, write/link failure, or schema mismatch fails closed |

## Trust boundary

- The command runs as the image `node` user with the same read-only root, dropped capabilities, `no-new-privileges`, bounded tmpfs, and release manifest as the application plane.
- The release-level diagnostics service receives one additional writable host directory dedicated to bounded support evidence.
- It never mounts the Docker socket, repository, browser profile, backup archive, customer storage, or host logs.
- It performs read-only database/provider probes and never sends product email or writes object-store data.
- Raw exceptions and provider responses are discarded. Only fixed states and messages enter evidence.
- The output is owner-only, canonical, digest-bound, and no-overwrite.

## Ownership

- `flowcordia-release-contract.mjs` owns the shared strict manifest/identity parser used by startup and diagnostics.
- `flowcordia-doctor.mjs` owns live probes, profile-specific check selection, bounded projection, CLI behavior, and evidence publication.
- `docker/flowcordia-self-host.yml` owns the optional one-shot diagnostics service and its dependency ordering/mounts.
- PostgreSQL, Redis, ClickHouse, Electric, object storage, email, GitHub App, ingress, and operations heartbeat remain owned by their existing platform/operator boundaries.
- Provider delivery, backup/restore, controlled upgrade, connected workflow, webhook, rollback, load, outage, and incident-response evidence remain separate release gates.

## Deliberate exclusions

Diagnostics does not repair an installation, execute migrations, create a backup, send a canary, verify a GitHub App installation or repository permission, prove inherited Trigger.dev execution workers, exercise a workflow, mutate public webhooks, validate rollback, measure scale, or establish an uptime promise.
