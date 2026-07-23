# Production self-host application plane

This runbook deploys the supported initial Flowcordia application plane from one immutable release image. It owns one release-confirmed migration job, one HTTP web replica, and one isolated proposal/index operations replica.

It does **not** bundle PostgreSQL, Redis, ClickHouse, Electric, S3-compatible object storage, email delivery, TLS ingress, or the inherited Trigger.dev execution-plane services. Those dependencies must already exist and pass the release preflight and connected acceptance gates.

## Supported initial topology

- one `linux/amd64` image referenced by `repository@sha256:digest`;
- one `migrate` one-shot service;
- exactly one `web` replica bound to host loopback;
- exactly one HTTP-disabled `operations` replica;
- one canonical release manifest mounted read-only into all three roles;
- a protected host directory for migration completion evidence;
- read-only application root filesystems with bounded `/tmp` tmpfs;
- all Linux capabilities dropped and `no-new-privileges` enabled.

This is a single-host, non-HA application plane. Do not advertise horizontal availability, zero-downtime schema upgrades, PITR, or cross-region recovery from this topology.

## 1. Obtain and verify the release

Use the protected image-publication workflow. Download its release manifest, bounded publication evidence, and signed attestation bundle. Independently verify the attestation as described in [`self-host-image-publication.md`](self-host-image-publication.md).

Never deploy the semantic-version or commit tag. Copy the immutable digest reference and manifest digests into the deployment configuration.

## 2. Prepare host files

Choose a dedicated host directory outside the repository:

```bash
sudo install -d -m 0750 -o 1000 -g 1000 /opt/flowcordia
sudo install -d -m 0700 -o 1000 -g 1000 /var/lib/flowcordia/migrations
sudo install -m 0640 -o 1000 -g 1000 \
  docker/flowcordia-self-host.env.example \
  /opt/flowcordia/deployment.env
sudo install -m 0600 -o 1000 -g 1000 \
  docker/flowcordia-self-host.secrets.example \
  /opt/flowcordia/deployment.secrets
sudo install -m 0440 -o 1000 -g 1000 \
  /protected/download/flowcordia-release-manifest.json \
  /opt/flowcordia/release-manifest.json
```

Replace every placeholder. The configuration file contains deployable identities and non-secret settings. The secrets file contains database URLs, encryption/session values, GitHub App material, object-store credentials, email credentials, and the proposal-event signing secret. A key must appear in only one file.

The container image runs as UID/GID `1000`; the manifest must be readable and the migration evidence directory writable by that identity.

## 3. Validate before mutation

Run the deterministic validator from the exact repository revision corresponding to the selected release tooling:

```bash
pnpm flowcordia:self-host:validate \
  --config /opt/flowcordia/deployment.env \
  --secrets /opt/flowcordia/deployment.secrets \
  --manifest /opt/flowcordia/release-manifest.json

docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  config --quiet
```

The gate blocks mismatched image/application/manifest identity, unsafe origins, malformed GitHub App configuration, invalid dependency URLs, incomplete object storage or email, unsupported replica counts, overlapping config/secrets, unsafe file permissions, and application replicas that could race migrations.

Then run the existing release-candidate, provider, alert, backup/restore, and controlled-upgrade gates for the exact release.

## 4. Pull without starting

```bash
docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  pull
```

Confirm the pulled repository digest equals `FLOWCORDIA_IMAGE_REFERENCE` and `FLOWCORDIA_IMAGE_DIGEST` from the canonical manifest.

## 5. Apply migrations once

Stop the current application replicas before a migration-bearing upgrade. Then run only the release-confirmed one-shot service:

```bash
docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  up --abort-on-container-exit --exit-code-from migrate migrate
```

The job:

1. verifies the mounted manifest, external manifest digest, application commit, image digest, and Node runtime;
2. requires `FLOWCORDIA_MIGRATION_CONFIRM` to equal the manifest release ID;
3. applies and verifies Prisma migrations;
4. applies and verifies dashboard-agent Drizzle migrations;
5. validates and applies ClickHouse migrations;
6. atomically writes owner-only completion evidence under the protected migration state directory.

Do not start web or operations replicas after a failed migration. Preserve logs and the migration evidence file with the release record.

## 6. Start operations, then web

```bash
docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  up -d --wait operations

docker compose \
  --env-file /opt/flowcordia/deployment.env \
  -f docker/flowcordia-self-host.yml \
  up -d --wait web
```

The operations container is healthy only while its event loop refreshes a bounded local readiness pulse tied to the exact application revision. The web container is healthy only when the existing `/healthcheck` route confirms release identity, plugins, and PostgreSQL readiness.

All long-running replicas set every migration skip flag to `1`. Published Flowcordia replicas fail boot if any migration path is enabled.

## 7. Configure ingress

The Compose file publishes web only on `127.0.0.1` by default. Terminate HTTPS in a separately managed reverse proxy or load balancer and forward to the loopback port. Preserve the exact public `APP_ORIGIN` and `LOGIN_ORIGIN`; do not expose the container directly on all interfaces.

## 8. Verify the connected journey

After dependencies and providers are READY:

1. run the protected browser-to-preview-to-production acceptance journey;
2. run signed production webhook acceptance, including replay, revocation, replacement, and predecessor isolation;
3. verify proposal/index operations heartbeat and local container health;
4. exercise the exact rollback path;
5. assemble and review the schema `0.4` launch dossier.

Repository CI or healthy containers alone are not production acceptance.

## Controlled upgrade

For every target release:

1. preserve and rehearse a backup for the exact current release;
2. verify the target image attestation, manifest, and publication evidence;
3. run controlled-upgrade and topology validation with exact current/target revisions;
4. update all host files atomically, including `FLOWCORDIA_MIGRATION_CONFIRM`;
5. pull the new digest;
6. stop web and operations for migration-bearing releases;
7. run the one-shot migration job;
8. start and wait for operations first, then web;
9. execute connected acceptance and preserve evidence.

Never run old and new application revisions against an unproven shared schema.

## Rollback

### Application-only release

When the controlled-upgrade evidence proves no database changes:

1. restore the previous manifest/config identities;
2. pull the previous immutable digest;
3. stop web and operations;
4. run the previous release migration job as an idempotent status/no-op check;
5. start operations, then web;
6. execute rollback acceptance and preserve evidence.

### Migration-bearing release

Do not point the previous application at a forward-only schema unless backward compatibility was explicitly proved. Stop the application plane, restore the rehearsed database backup into the supported recovery target, select the previous release manifest and image, then restart operations and web and run rollback acceptance.

## Stop-ship

Do not deploy when:

- the image is referenced by a tag;
- attestation or publication evidence cannot be verified;
- config, secrets, manifest, or migration-state paths are inside the repository or have unsafe ownership/modes;
- the topology validator is not READY;
- the migration job is not release-confirmed or does not complete every owned datastore;
- any application replica can run migrations;
- the web or operations health contract is unavailable;
- the public origin is not protected by HTTPS ingress;
- external dependency, provider, recovery, upgrade, connected acceptance, webhook, rollback, or dossier evidence is missing.
