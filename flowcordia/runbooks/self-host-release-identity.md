# Self-host release identity

FlowCordia self-host distribution must begin with one immutable release identity. A container tag, Git commit, package version, or database migration count alone is not sufficient because each can drift independently.

## Contract

A release manifest binds:

- one bounded release ID and semantic version;
- the exact lowercase FlowCordia application commit;
- the exact Trigger.dev upstream commit represented by the release;
- one OCI image referenced by `repository@sha256:digest`, never by a mutable tag;
- the exact Node.js and pnpm versions used by the supported build;
- both the web application and FlowCordia operations worker to the same application revision and image digest;
- the ordered repository migration inventory and canonical digest;
- one canonical manifest digest.

The manifest contains no credentials, tokens, URLs containing authentication, customer data, payloads, browser state, database identities, provider recipients, or raw errors.

## Create a candidate manifest

Build and push the release image first, then use its registry-reported immutable digest. Store the resulting manifest outside the repository and protected build workspace.

```bash
pnpm flowcordia:release:manifest \
  --release-id flowcordia-0.1.0-rc.1 \
  --version 0.1.0-rc.1 \
  --application-sha "$FLOWCORDIA_APPLICATION_COMMIT_SHA" \
  --upstream-sha "$TRIGGER_UPSTREAM_COMMIT_SHA" \
  --image "ghcr.io/example/flowcordia@sha256:<64-lowercase-hex>" \
  --created-at "2026-07-23T00:00:00.000Z" \
  --output /protected/flowcordia-release-0.1.0-rc.1.json
```

The output path must already exist, must be outside the repository, must end in `.json`, and is created with no-overwrite semantics and owner-only permissions.

## Enforce the manifest at runtime

Release enforcement remains default-off for development and inherited deployments. A published self-host release must mount the exact manifest into each web and operations-worker container and set:

```text
FLOWCORDIA_RELEASE_RUNTIME_REQUIRED=1
FLOWCORDIA_RELEASE_MANIFEST_PATH=/run/flowcordia/release-manifest.json
FLOWCORDIA_RELEASE_MANIFEST_SHA256=<manifestSha256>
FLOWCORDIA_APPLICATION_COMMIT_SHA=<applicationCommitSha>
FLOWCORDIA_IMAGE_DIGEST=<64-lowercase-hex-without-sha256-prefix>
```

Web replicas additionally use:

```text
FLOWCORDIA_RELEASE_COMPONENT=web
FLOWCORDIA_PROPOSAL_WORKER_ENABLED=0
HTTP_SERVER_DISABLED=false
```

The dedicated operations replica uses the same immutable image and manifest with:

```text
FLOWCORDIA_RELEASE_COMPONENT=operations_worker
FLOWCORDIA_PROPOSAL_WORKER_ENABLED=1
FLOWCORDIA_STUDIO_ENABLED=0
HTTP_SERVER_DISABLED=true
```

The runtime opens the manifest as one bounded regular file with no symbolic-link following, validates its canonical digest against the independently supplied expected digest, and requires the component, application revision, image digest, Node.js version, and process role to agree. Verification runs before inherited workers, FlowCordia operations, HTTP readiness, or bootstrap mutation. The `/healthcheck` readiness route reasserts the cached identity.

A successful projection contains only bounded release, version, component, application, upstream, image, migration, and manifest identity. It contains no manifest path, image repository, environment value, credential, payload, or raw filesystem error.

## Required use

The release manifest is the identity source for later distribution work. Before public self-host packaging is accepted:

1. the web application and operations worker must enforce the manifest before startup;
2. every deployed image reference must resolve to the manifest digest;
3. the live database migration history must be a compatible prefix of the manifest migration inventory;
4. installation, dependency, provider, alert, recovery, upgrade, connected acceptance, webhook acceptance, and rollback evidence must identify the same release;
5. the immutable schema `0.4` launch dossier must preserve the release decision.

## Stop-ship

Block distribution when:

- an image uses a tag without an immutable digest;
- web and worker revisions or image digests disagree;
- a component does not enforce the independently anchored manifest digest before startup and readiness;
- the web process enables proposal operations or disables HTTP;
- the operations process serves HTTP, enables Studio, or leaves proposal operations disabled;
- the mounted manifest is missing, relative, symbolic-linked, malformed, oversized, changed while read, or digest-mismatched;
- the repository migration inventory is missing, duplicated, unordered, malformed, or rewritten;
- the application or upstream revision is invalid or placeholder-backed;
- the runtime toolchain differs from the supported versions;
- the manifest contains unexpected fields or its canonical digest does not match;
- a manifest output path already exists or is inside the repository.

## Deliberate boundary

This contract does not yet publish images, provide a production Compose or Helm installation, sign artifacts, configure ingress, generate secrets, or claim public-beta self-host support. Those stages must consume and enforce this manifest rather than inventing separate version identities.
