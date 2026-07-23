# Published self-host lifecycle acceptance

This runbook proves the supported initial Flowcordia self-host application path using two immutable releases produced by the protected image-publication workflow.

The lifecycle is destructive to its dedicated disposable installation. It is not a repository-only simulation and must not run on a shared production host, shared database, reused Compose project, or ordinary GitHub-hosted runner.

## What the protected run proves

The protected workflow:

1. selects distinct successful current and target image-publication runs;
2. requires the target publication to belong to the exact workflow `main` commit;
3. downloads the canonical manifests and bounded image-publication evidence;
4. independently verifies both OCI attestations against the official publication workflow, exact source commits, `main` source ref, and GitHub-hosted publication runner policy;
5. validates current and target topology configuration before mutation;
6. proves both releases describe the same application origin, dependency identities, and stable cryptographic installation boundary without recording their values;
7. proves the primary Prisma, dashboard-agent Drizzle, and ClickHouse Goose migration histories are empty before the first migration;
8. proves a clean application-plane install with one release-confirmed migration job;
9. starts operations and web from the current immutable image and records READY diagnostics;
10. restarts the same replicas without rerunning migrations and records a new READY diagnostic;
11. creates a current-release PostgreSQL custom archive and completes an isolated restore rehearsal;
12. classifies the exact current-to-target transition as application-only or append-only migrations;
13. deploys the target release through its own no-overwrite migration evidence, operations/web readiness, and READY diagnostics;
14. performs a real application rollback when the schema is unchanged, or proves and preserves the restore-required boundary without starting the previous application on a forward-only schema;
15. removes application containers and the Compose network;
16. emits one owner-only, no-overwrite schema `0.1` lifecycle artifact.

## Protected runner requirements

Use a dedicated self-hosted Linux x64 runner labelled `flowcordia-release`.

The runner must:

- execute as UID/GID `1000`, matching the published image user;
- be isolated from ordinary CI and untrusted pull requests;
- have Docker, Docker Compose, GitHub CLI, Node `20.20.2`, pnpm `10.33.2`, PostgreSQL client tools, and outbound access to GitHub/GHCR and configured dependencies;
- have no pre-existing lifecycle project containers or network;
- use disposable but realistic PostgreSQL, Redis, ClickHouse, Electric, object storage, email, ingress, and inherited Trigger.dev execution-plane dependencies;
- store configuration, credentials, work files, recovery archives, diagnostics, and final evidence outside the repository;
- be reset or reviewed after a failed run before reuse.

The workflow rejects any runner UID other than `1000` and never runs from `pull_request`.

## Protected environment configuration

Create the `flowcordia-self-host-lifecycle` GitHub environment with required reviewers and these values:

| Name | Type | Purpose |
| --- | --- | --- |
| `FLOWCORDIA_LIFECYCLE_CURRENT_CONFIG_FILE` | environment variable | Absolute validated config for the installed/current release |
| `FLOWCORDIA_LIFECYCLE_CURRENT_SECRETS_FILE` | environment secret | Absolute owner-only secrets file for the current release |
| `FLOWCORDIA_LIFECYCLE_TARGET_CONFIG_FILE` | environment variable | Absolute validated config for the target release |
| `FLOWCORDIA_LIFECYCLE_TARGET_SECRETS_FILE` | environment secret | Absolute owner-only secrets file for the target release |
| `FLOWCORDIA_LIFECYCLE_WORK_PARENT` | environment variable | Absolute protected parent for unique no-reuse lifecycle workspaces |
| `FLOWCORDIA_LIFECYCLE_EVIDENCE_DIR` | environment variable | Absolute protected no-overwrite final evidence directory |

The current and target configuration files must independently match their canonical release manifests and resolve to the same application origin, PostgreSQL databases, Redis, ClickHouse, Electric, object-store bucket, GitHub App, email identity, proposal-event endpoint, and stable session/encryption/event-signing boundary. Credential values and URLs remain in the external files; only a deterministic installation digest enters lifecycle evidence.

The configured PostgreSQL and ClickHouse targets must be disposable and empty. The workflow blocks before migration when the primary Prisma history, dashboard-agent Drizzle journal, or ClickHouse Goose history already contains a migration record.

## Starting a run

Run **Flowcordia published self-host lifecycle** from the exact target `main` revision.

Provide:

- `current_publication_run_id`: a successful older official image-publication run;
- `target_publication_run_id`: a successful official image-publication run whose head SHA equals the lifecycle workflow SHA;
- confirmation: `RUN-PUBLISHED-SELF-HOST-LIFECYCLE`.

The two publication runs, releases, application commits, and image digests must be distinct.

## Migration evidence

Every current and target migration phase writes schema `0.2` evidence containing:

- exact release ID and semantic version;
- application commit, image digest, and manifest digest;
- exact release migration count and digest;
- canonical completion time;
- deterministic evidence digest.

The file is `0600`, created atomically, and cannot overwrite an existing release record. A duplicate release migration invocation fails closed instead of replacing prior evidence.

## Upgrade and rollback behavior

### Application-only transition

When current and target migration histories are identical:

- target migration runs as an exact no-op/status verification and records target-release evidence;
- target operations/web/diagnostics must be READY;
- the workflow stops target replicas;
- current operations and web are recreated with `--no-deps`, so migrations are not rerun;
- a new current-release READY diagnostic proves the application rollback;
- teardown follows.

### Append-only migration transition

When the target adds migrations without rewriting the applied prefix:

- a fresh current backup and isolated restore rehearsal are mandatory;
- operator migration review, maintenance-window acceptance, and restore-based rollback acceptance are mandatory;
- target migration, startup, and diagnostics must be READY;
- the workflow stops target replicas;
- the previous application is **not** started on the forward-only schema;
- final evidence records `restore_required` and binds the matching backup/restore digests;
- teardown follows.

This workflow does not destructively restore the live disposable database after the target migration. It proves the rehearsed restore boundary and prevents the unsafe backward application start. A separate authorized recovery exercise owns an actual restore.

## Final evidence

Schema `0.1` lifecycle evidence contains only:

- current and target release IDs, versions, application revisions, image/manifest digests, and publication/migration/diagnostic evidence digests;
- installation-identity, stable installation, and clean-dependency evidence digests;
- backup manifest, restore evidence, archive, and upgrade evidence digests;
- PostgreSQL major version and migration counts;
- rollback mode and optional rollback diagnostic digest;
- fixed ordered READY phase names and timestamps;
- official workflow/run/source identity;
- final deterministic evidence digest.

It never contains image URLs, config/secrets paths, database URLs, provider responses, archive paths, raw command output, payloads, tenant identity, browser state, or customer data.

The artifact proves one protected lifecycle run at one point in time. It does not prove inherited workflow execution, provider delivery, public webhook behavior, load limits, high availability, PITR, outage recovery, or incident response.

## Stop-ship

Stop the release when:

- either publication run is unofficial, unsuccessful, not from `main`, or cannot be independently attested;
- the target publication does not match the exact lifecycle workflow commit;
- the current and target release or publication identities are reused or mixed;
- the lifecycle workspace, Compose project, output, migration evidence, or diagnostics artifact already exists;
- current or target topology validation is not READY;
- migration evidence can be overwritten, lacks a digest, or differs from its manifest;
- install, restart, recovery rehearsal, upgrade preflight, target deployment, rollback boundary, or teardown is not READY;
- application-only rollback does not produce a new current-release diagnostic;
- a migration-bearing path starts the previous application on the forward schema;
- containers, the application network, or Compose project volumes remain after teardown;
- the final artifact contains fields outside the bounded schema or its digest changes;
- a repository test or dry-run is presented as a configured protected lifecycle result.
