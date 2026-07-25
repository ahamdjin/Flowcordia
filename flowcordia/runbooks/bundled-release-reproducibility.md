# Reproducible bundled releases

The bundled single-host topology is supported only when both immutable manifests agree:

1. the Flowcordia application release manifest binds the exact application commit, Trigger.dev upstream revision, application image digest, runtime, components, and migrations;
2. the bundled release manifest binds that application manifest to one ordered `linux/amd64` dependency image set.

A healthy Compose render or a tag such as `latest`, `v4-beta`, `14`, or `7-alpine` is not release identity.

## Required image inventory

The bundled manifest records exactly one immutable reference for:

- PostgreSQL;
- Redis;
- Electric;
- ClickHouse;
- MinIO;
- the private OCI registry;
- BusyBox used by initialization jobs;
- the Docker socket proxy;
- the Trigger.dev supervisor;
- S2.

Every reference must end in lowercase `@sha256:<64 hex>`. Tags may remain before the digest for readability, but the digest is authoritative. The supported wrapper renders `docker/flowcordia-bundled-immutable.yml` last so the mutable development defaults in the additive base overlay cannot reach a supported deployment.

## Create the bundled manifest

Prepare the external deployment configuration with all ten immutable image references, then run:

```bash
pnpm exec tsx scripts/flowcordia-bundled-release.ts \
  --application-manifest /opt/flowcordia/release-manifest.json \
  --config /opt/flowcordia/deployment.env \
  --output /opt/flowcordia/bundled-release-manifest.json \
  --compatibility-version 1 \
  --created-at 2026-07-25T00:00:00.000Z
```

Store the returned digest as `FLOWCORDIA_BUNDLED_RELEASE_MANIFEST_SHA256`. The output is no-overwrite. A dependency upgrade requires a new compatibility version, a new manifest, a new clean-install result, and a fresh connected release campaign. Do not edit an accepted manifest in place.

Validate before Docker access:

```bash
pnpm exec tsx scripts/flowcordia-bundled-validate.ts \
  --config /opt/flowcordia/deployment.env \
  --secrets /opt/flowcordia/deployment.secrets \
  --manifest /opt/flowcordia/release-manifest.json \
  --bundle-manifest /opt/flowcordia/bundled-release-manifest.json \
  --registry-auth /opt/flowcordia/registry.htpasswd
```

The validator rejects a missing image, tag-only image, changed digest, reordered inventory, application mismatch, manifest digest mismatch, or deployment environment that differs from the reviewed manifest.

## Protected blank-host proof

Run **Flowcordia bundled clean install** from the exact `main` revision after the official application image publication succeeds. The protected environment must provide:

- `FLOWCORDIA_BUNDLED_CONFIG_FILE` as an absolute external config path;
- `FLOWCORDIA_BUNDLED_SECRETS_FILE` as an owner-only absolute secrets path;
- `FLOWCORDIA_BUNDLED_REGISTRY_AUTH_FILE` as an owner-only absolute htpasswd path;
- `FLOWCORDIA_BUNDLED_WORK_PARENT` as a writable isolated work parent;
- `FLOWCORDIA_BUNDLED_EVIDENCE_DIR` as an owner-controlled no-overwrite evidence directory.

The workflow verifies the official publication and GitHub attestation, creates a fresh bundled manifest, allocates unique project/network/volume identities, pulls every exact image, installs and migrates from an empty project, starts the web, operations, supervisor, and dependency plane, runs `flowcordia doctor`, removes the complete project with volumes, and confirms no project container, network, or volume remains.

The bounded artifact contains only release identities, digests, compatibility version, phase, cleanup state, and timestamps. It must not contain image credentials, provider values, paths, logs, payloads, outputs, database identities, or customer data.

## Legacy dependency availability

The current bundle inherits legacy Bitnami ClickHouse and MinIO layouts. Legacy registries may disappear. Before accepting a release, mirror every exact dependency digest into an operator-controlled registry and update the bundled manifest to those mirrored immutable references. A mirror changes repository location and therefore requires a new bundled manifest even when the image content digest is unchanged.

The long-term replacement of a legacy image is an intentional compatibility change. It requires migration review, diagnostics, blank-host acceptance, upgrade/recovery proof, and the full connected release campaign.

## Stop-ship

Stop the release when:

- any supported Compose path can render a tag-only dependency;
- the application or bundled manifest is missing, mutable, overwritten, or digest-invalid;
- deployment image references do not equal the bundled manifest exactly;
- the official application publication or attestation cannot be verified;
- the clean-install project reuses existing volumes, networks, or containers;
- diagnostics are not READY;
- teardown leaves a container, network, or volume behind;
- the connected release campaign uses another application or bundled manifest.
