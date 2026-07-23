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

## Required use

The release manifest is the identity source for later distribution work. Before public self-host packaging is accepted:

1. the web application and operations worker must report the manifest application commit;
2. every deployed image reference must resolve to the manifest digest;
3. the live database migration history must be a compatible prefix of the manifest migration inventory;
4. installation, dependency, provider, alert, recovery, upgrade, connected acceptance, webhook acceptance, and rollback evidence must identify the same release;
5. the immutable schema `0.4` launch dossier must preserve the release decision.

## Stop-ship

Block distribution when:

- an image uses a tag without an immutable digest;
- web and worker revisions or image digests disagree;
- the repository migration inventory is missing, duplicated, unordered, malformed, or rewritten;
- the application or upstream revision is invalid or placeholder-backed;
- the runtime toolchain differs from the supported versions;
- the manifest contains unexpected fields or its canonical digest does not match;
- a manifest path already exists or is inside the repository.

## Deliberate boundary

This contract does not yet publish images, provide a production Compose or Helm installation, sign artifacts, configure ingress, generate secrets, or claim public-beta self-host support. Those stages must consume this manifest rather than inventing separate version identities.
