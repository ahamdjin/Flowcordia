# Self-host diagnostics and support evidence

`flowcordia doctor` is a non-mutating diagnostics command shipped inside every advertised Flowcordia self-host image. It verifies that the running installation still agrees with the exact release manifest and that the bounded application-plane dependencies needed by the selected profile are available.

It does not repair configuration, apply migrations, rotate credentials, create provider data, send email, claim an execution-plane workflow succeeded, or replace release acceptance.

## What it checks

Every profile verifies:

- canonical release manifest structure and digest;
- exact application, Trigger.dev upstream, image, Node, component, and manifest identity;
- production secret/origin/GitHub App/worker-delivery configuration shape;
- application-replica migration isolation;
- PostgreSQL connectivity;
- exact successful Prisma migration inventory and checksums;
- Redis authentication and PING;
- ClickHouse `SELECT 1`;
- Electric transport reachability;
- read-only S3-compatible bucket HEAD;
- non-console product-email transport configuration;
- exact GitHub App authentication;
- canonical HTTPS public origin.

Profile-specific checks:

- `web`: internal and public web health; worker heartbeat is skipped.
- `operations`: durable worker heartbeat and process-local event-loop readiness; web reachability is skipped.
- `release`: durable worker heartbeat plus internal and public web health; process-local operations readiness is skipped because diagnostics runs as a separate one-shot container.

## Evidence boundary

Schema `0.1` diagnostics contain only:

- release ID and version;
- application and Trigger.dev upstream revisions;
- image and manifest digests;
- profile;
- canonical timestamp;
- fixed check names, states, and messages;
- deterministic evidence digest.

Diagnostics never include credentials, secret values, URLs, database names or rows, provider responses, raw exceptions, payloads, outputs, browser state, tenant identity, internal record IDs, or customer data.

`BLOCKED` means release identity or production configuration is unsafe or inconsistent. `UNAVAILABLE` means the static boundary is valid but one or more live checks could not establish readiness. `READY` means every check required by the selected profile was observed successfully at that moment. A READY result is not a support SLA or a substitute for other release evidence.

## Run inside the supported Compose topology

Create the diagnostics directory outside the repository and make it writable by image UID/GID `1000`:

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /var/lib/flowcordia/diagnostics
```

Set:

```text
FLOWCORDIA_DIAGNOSTICS_STATE_DIR=/var/lib/flowcordia/diagnostics
```

After `operations` and `web` are healthy, run the one-shot diagnostics profile:

```bash
docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  --profile diagnostics \
  up --abort-on-container-exit --exit-code-from doctor doctor
```

The service writes:

```text
/var/lib/flowcordia/diagnostics/<release-id>.json
```

The output is owner-only and no-overwrite. A second run for the same release stops instead of replacing the previous evidence. Preserve the reviewed artifact, then use a new protected directory when a fresh point-in-time diagnostic is required.

The diagnostics service:

- uses the same immutable image and release manifest as web and operations;
- starts only after both long-running services are healthy;
- has a read-only root filesystem, bounded `/tmp`, no Linux capabilities, and no public port;
- mounts only the release manifest and protected diagnostics directory;
- performs no object writes or email sends.

## Run a process-specific check

Inside a web container:

```bash
node ./scripts/flowcordia-doctor.mjs --profile web --json
```

Inside the operations container:

```bash
node ./scripts/flowcordia-doctor.mjs --profile operations --json
```

The operations profile checks `/tmp/flowcordia/operations-health.json`, so it must run in the operations container rather than a separate diagnostics container.

## Repository/operator command

From an exact release checkout with generated Prisma client and the release environment loaded:

```bash
pnpm flowcordia:doctor -- --profile release --json
```

Published-image execution remains the authoritative self-host path because it proves the command and application share the same image contents.

## Support handoff

Before sharing diagnostics:

1. confirm the file permission is `0600` and the parent directory is restricted;
2. inspect that the file contains only schema `0.1` bounded fields;
3. do not add application logs, environment files, provider responses, database dumps, screenshots, browser exports, or network captures unless a private security/support process explicitly requests a separately sanitized artifact;
4. reference the exact release publication and release-dossier records separately.

Use the support process in [`SUPPORT.md`](../../SUPPORT.md). Security-sensitive findings must follow [`SECURITY.md`](../../SECURITY.md), not a public issue.

## Interpretation

| State | Meaning | Operator action |
| --- | --- | --- |
| `READY` | Every required bounded check succeeded at the recorded time | Continue the protected release sequence; do not skip provider, recovery, connected, webhook, rollback, or load evidence |
| `BLOCKED` | Release identity or static production configuration is unsafe or inconsistent | Stop before mutation; correct the manifest/configuration mismatch and rerun all earlier gates |
| `UNAVAILABLE` | Static identity/configuration is valid but one or more live dependencies were not proven | Keep the release stopped or restricted; repair the owning dependency and create a fresh no-overwrite diagnostic artifact |
| `SKIPPED` check | The selected process profile does not own that check | Run the owning profile or the release diagnostics service when the release gate requires it |

## Stop-ship

Stop the release when:

- diagnostics was not executed from the exact published image;
- the manifest, application, image, runtime, or component identity is blocked;
- migrations differ from the release manifest;
- any application replica can run migrations;
- PostgreSQL, Redis, ClickHouse, Electric, object storage, GitHub App, worker heartbeat, or required web health is unavailable;
- the advertised origin is not HTTPS or cannot serve the health route without redirect;
- diagnostics contains values outside the bounded schema;
- a prior diagnostics artifact was overwritten or its evidence digest changed;
- a READY diagnostic is used as a replacement for provider delivery, backup/restore, upgrade, connected workflow, webhook, rollback, load, outage, or incident-response evidence.
