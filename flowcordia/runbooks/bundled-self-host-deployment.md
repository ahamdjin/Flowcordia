# Bundled single-server self-host deployment

## Purpose

This runbook installs the complete initial Flowcordia stack on one Docker host. It combines the existing immutable Flowcordia application plane with bundled PostgreSQL, Redis, ClickHouse, Electric, MinIO, S2 realtime streams, a private deployment registry, the inherited Trigger.dev supervisor, and the restricted Docker socket proxy.

The existing external-service deployment remains supported and unchanged. Use [`self-host-deployment.md`](self-host-deployment.md) when PostgreSQL, Redis, ClickHouse, Electric, object storage, registry, or the execution plane are managed separately.

## Supported boundary

The bundled topology is intended for:

- evaluation and local product trials;
- one-VPS open-source installations;
- small production installations with explicit backups;
- operators who want one documented stack before moving dependencies to managed services.

It is not a high-availability topology. One Docker host remains a shared failure domain for the application, databases, storage, registry, and workflow execution.

## Services

Long-running services:

- `web` — Flowcordia UI, API, Studio, webhook ingress, and Trigger.dev control plane;
- `operations` — GitHub proposal, repository-index, outbox, and reconciliation worker;
- `postgres` — primary application database with logical replication enabled;
- `redis` — coordination, rate limiting, caches, and realtime support;
- `clickhouse` — run events and execution analytics;
- `electric` — PostgreSQL-backed realtime synchronization;
- `minio` — private S3-compatible payload and artifact storage;
- `s2` — realtime streams v2 and AI-agent token streaming;
- `registry` — private task-deployment image storage;
- `supervisor` — inherited Trigger.dev execution supervisor;
- `docker-proxy` — restricted Docker API boundary used by the supervisor.

One-shot services:

- `shared-init` prepares the bootstrap worker-token volume for UID/GID `1000`;
- `s2-init` writes the exact basin specification;
- `migrate` verifies the release and applies all owned datastore migrations;
- optional `doctor` writes bounded release diagnostics after the application and execution plane are healthy.

## Security boundary

PostgreSQL, Redis, ClickHouse, Electric, MinIO's API, S2, supervisor, and the Docker proxy are not published on host interfaces. They communicate over named Docker bridge networks.

Only these convenience ports are published, all on host loopback:

- Flowcordia web: `127.0.0.1:3030` by default;
- MinIO console: `127.0.0.1:9001` by default;
- registry: `127.0.0.1:5000` by default.

Terminate public HTTPS in a separately managed reverse proxy or load balancer. Only `docker-proxy` mounts `/var/run/docker.sock`, read-only. The supervisor reaches it over an internal-only network with a bounded Docker API allowlist.

## 1. Requirements

The host requires Linux, Docker Engine, Docker Compose v2, `openssl`, sufficient persistent disk, a protected Flowcordia release image and manifest, a GitHub App, an email provider, and an HTTPS hostname.

A practical starting point is at least 8 vCPU, 16 GB RAM, and fast persistent storage. Real requirements depend on workflow concurrency and task machine presets.

## 2. Generate protected deployment files

Choose an absolute directory outside the repository:

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /opt/flowcordia
sudo -u '#1000' bash ./docker/scripts/generate-flowcordia-bundled-secrets.sh /opt/flowcordia
```

The generator creates:

```text
/opt/flowcordia/deployment.env
/opt/flowcordia/deployment.secrets
/opt/flowcordia/registry.htpasswd
/opt/flowcordia/migrations/
/opt/flowcordia/diagnostics/
```

It generates independent strong values for application, PostgreSQL, Redis, ClickHouse, MinIO, registry, supervisor, GitHub webhook, and proposal-event secrets. It does not invent release identities, public origins, GitHub App private keys, or provider credentials.

Replace every `<replace-...>` value. Install the exact canonical release manifest at `/opt/flowcordia/release-manifest.json`. Keep `deployment.secrets` and `registry.htpasswd` owner-readable only and never place them in support artifacts.

## 3. Pin dependency images

The generated configuration preserves recognizable inherited versions for initial setup. Before accepting release evidence, replace mutable dependency tags with reviewed immutable digests wherever the registry supports them.

Record exact identities for PostgreSQL, Redis, Electric, ClickHouse, MinIO, registry, BusyBox, Docker socket proxy, Trigger.dev supervisor, and S2. The Flowcordia image must always use `repository@sha256:digest` and match the canonical release manifest.

## 4. Validate without starting containers

```bash
pnpm exec tsx scripts/flowcordia-bundled-validate.ts \
  --config /opt/flowcordia/deployment.env \
  --secrets /opt/flowcordia/deployment.secrets \
  --manifest /opt/flowcordia/release-manifest.json \
  --registry-auth /opt/flowcordia/registry.htpasswd

bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets \
  --profile diagnostics config --quiet
```

The validator requires exact private identities for PostgreSQL, Redis, ClickHouse, Electric, MinIO, S2, the registry, and worker bootstrap. It also enforces one web replica, one operations replica, exact release identity, and one migration owner.

Private HTTP is allowed only for exact Compose service identities. Public application and login origins must remain HTTPS.

## 5. Pull and start

```bash
bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets \
  pull

bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets
```

The default wrapper action is `up -d --wait`. Dependencies become healthy before the release-confirmed migration job. Web and operations start only after migration succeeds. Supervisor starts after web, registry, and Docker proxy health are available.

Inspect status without exposing secrets:

```bash
bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets \
  ps
```

Do not manually start application services after a failed migration. Correct the failure and rerun the exact release path.

## 6. Registry and HTTPS

Workflow deployment commands run on the Docker host and push task images to the loopback registry:

```bash
docker login 127.0.0.1:5000
```

Use the generated registry credentials. Do not expose this plain-HTTP registry outside host loopback. Remote builders require a separately secured TLS registry.

Forward the public Flowcordia hostname to `127.0.0.1:3030`. Preserve exact HTTPS `APP_ORIGIN` and `LOGIN_ORIGIN` values. The public `/healthcheck` route must be reachable over HTTPS without redirect.

## 7. Diagnostics and connected proof

```bash
bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets \
  --profile diagnostics up --abort-on-container-exit --exit-code-from doctor doctor
```

The existing `doctor` checks the immutable application release and supported dependency/provider boundaries. Bundle validation separately proves S2, registry, bootstrap, and private-network identities.

A READY diagnostic is not execution proof. Deploy and execute a reference workflow, confirm that supervisor launches its versioned run container, and verify realtime output through S2 before launch evidence is accepted.

## Persistent data

Named volumes preserve data across ordinary restarts and container replacement:

- `flowcordia-postgres`;
- `flowcordia-redis`;
- `flowcordia-clickhouse`;
- `flowcordia-minio`;
- `flowcordia-registry`;
- `flowcordia-s2`;
- `flowcordia-s2-config`;
- `flowcordia-shared`.

This stops containers while preserving named volumes:

```bash
bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets \
  down
```

**Never run `docker compose down -v` unless permanent deletion of PostgreSQL, Redis, ClickHouse, MinIO objects, registry images, S2 data, and the bootstrap worker token is explicitly intended and independently recoverable.**

Changing `FLOWCORDIA_VOLUME_PREFIX` selects a different empty installation; it does not migrate data.

## Backup requirements

Before production use, automate and rehearse backups for PostgreSQL, ClickHouse, MinIO buckets, registry storage or reproducible task-image rebuilds, deployment files, release manifests, registry authentication, and any S2 data required by the declared retention contract.

Redis is not the authority for durable application data, but losing it can affect coordination, cached state, limits, and in-flight work. Test recovery rather than assuming recreation is harmless.

## Upgrade procedure

For every target release:

1. rehearse current-release backup and restore;
2. verify target publication, attestation, manifest, and dependency-image identities;
3. run bundle validation and merged Compose rendering;
4. pull without starting;
5. stop web, operations, and supervisor for migration-bearing releases;
6. run the exact one-shot migration job;
7. start and wait for the bundle;
8. run diagnostics;
9. deploy and execute the connected reference workflow;
10. preserve upgrade and rollback evidence.

Never run old and new application revisions concurrently against an unproven shared schema.

## When to move to external services

Use the external-service topology when you need managed databases, independent scaling or upgrade windows, multiple worker hosts, remote builders, a TLS registry, high availability, PITR, off-host backups, regional recovery, or separate application and execution failure domains.

Moving away from the bundle is a controlled data migration, not an environment-variable-only switch.

## Stop-ship

Do not launch when the application image is mutable, dependency images are unreviewed, validation fails, secrets have unsafe permissions, public origins are not HTTPS, a data service or Docker proxy is publicly exposed, migrations are ambiguous, supervisor/task-image/S2 execution is unproven, backups are unrehearsed, or connected workflow, webhook, rollback, lifecycle, and launch-dossier evidence is incomplete.
