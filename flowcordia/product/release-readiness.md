# Release readiness

This document separates implemented contracts from production evidence. FlowCordia must not claim a maturity level that its preserved evidence does not support.

## Current stage

**Internal alpha**

The repository contains a connected architecture for repository workflow discovery, durable Studio drafts, deterministic compilation, governed GitHub proposals, typed repository functions, signed production webhooks, preview deployment correlation, exact-head validation, policy evidence, promotion, bounded operator release gates, immutable self-host release identity, immutable bundled dependency identity, fail-closed runtime identity enforcement, protected attested image publication, a validated single-host production application plane, published-image bounded diagnostics, immutable migration completion evidence, a protected blank-host bundle harness, a protected two-release lifecycle harness, a fixed connected release campaign controller, and a schema `0.6` ten-source immutable launch dossier.

The remaining release risk is primarily execution rather than missing contract code: one configured READY launch-campaign preflight, one successful protected bundled clean install, one successful protected lifecycle run, one complete connected campaign, configured operator evidence, supported recovery objectives, provider operating evidence, load/outage testing, and production experience remain mandatory.

## Stage definitions

### Internal alpha

- Feature access is limited to operators and selected internal organizations.
- Repository CI is authoritative for code quality, contracts, builds, and repository end-to-end tests.
- Connected environment runs are performed manually and may still expose rollout defects.
- No uptime, upgrade, recovery, or compatibility promise is made.

### Private beta

Requires all alpha gates plus:

- one preserved connected reference-repository acceptance record;
- repeatable installation and upgrade instructions;
- no raw JSON requirement for the primary first-party workflow path;
- production telemetry and alert ownership;
- tested rollback for application, database, proposal, deployment, workflow, and public webhook state;
- at least one non-maintainer user completing the core journey without repository intervention.

### Public beta

Requires all private-beta gates plus:

- documented support boundaries and compatibility policy;
- guided onboarding and repository bootstrap;
- public security reporting process;
- immutable release artifacts, dependency sets, and versioned migrations bound to canonical manifests and enforced by every advertised runtime component;
- verified signed provenance and bounded publication evidence for every advertised release image;
- published-image diagnostics and sanitized support evidence for every supported deployment mode;
- load, abuse, outage, and recovery testing for supported deployment modes;
- no hidden manual step in the advertised core journey.

### General availability

Requires all public-beta gates plus:

- supported high-availability topology;
- backup and disaster-recovery objectives with tested restores;
- controlled upgrades and rollback across supported versions;
- enterprise identity and governance claims backed by production evidence;
- published service, support, retention, and deprecation policies.

## Core release gates

| Gate | Current status | Required evidence |
| --- | --- | --- |
| Canonical workflow identity | Implemented | Contract, migration, deterministic serialization, and round-trip tests |
| Repository discovery and exact reads | Implemented | Signed/manual synchronization tests and exact commit/blob/path proof |
| Durable Studio authoring | Implemented | Optimistic concurrency, stale-source, audit, and browser-redaction tests |
| Compiler and runtime bridge | Implemented | Generated source fixture, typecheck, live-adapter, and failure tests |
| Governed proposal lifecycle | Implemented | Exact base/head, ambiguous-write, GitHub evidence, and merge-SHA tests |
| Typed repository functions | Implemented | Catalog, schema, static import, real handler, invalid input/output, and removal tests |
| Preview deployment correlation | Implemented in code | Connected deployment on the exact proposal head and worker version |
| Connected live execution proof | Not preserved | Browser-started run with trusted node evidence and exact-head proof marked verified |
| Production promotion | Implemented in code | Fresh policy evaluation, exact expected head merge, and promoted deployment proof |
| Signed production webhook | Implemented in code | Exact immutable activation, signed delivery, replay recovery, revocation, replacement, and version-locked production execution in the reference environment |
| Rollback | Documented and implemented in code | Demonstrated previous-commit and previous-deployment recovery in the reference repository |
| Product configuration UX | Implemented for the supported visual slice | Non-maintainer completion of the primary workflow without raw JSON or repository intervention |
| Installation configuration | Implemented as a deterministic preflight | Web, worker, and release profiles block unsafe configuration without exposing values |
| Core live dependency health | Implemented as a non-destructive preflight | PostgreSQL writer, exact repository migration set, GitHub App authentication, and required worker heartbeat produce bounded READY/BLOCKED/UNAVAILABLE evidence |
| Logical database recovery | Implemented as an operator harness | Exact custom archive, versioned manifest, isolated restore, migration parity, cleanup, and redacted READY evidence; a configured restore rehearsal remains required per release |
| Controlled upgrade decision | Implemented as a read-only preflight | Exact current/candidate revisions, checksum-bound migration prefix, fresh recovery evidence for schema changes, operator acknowledgements, and deterministic rollout phases |
| Release-candidate evidence binding | Implemented as a bounded validator | Exact release identity, live dependency readiness, backup/restore digests, current/target revisions, migration counts, upgrade kind, acknowledgements, chronology, freshness, and connected-acceptance sequence produce one READY result |
| Launch campaign configuration readiness | Implemented as a protected non-destructive gate | One exact-main schema `0.1` run must prove protected-environment approval, dedicated runner and path safety, provider and alert configuration, browser fixtures/sessions, webhook HMAC shape, and release-evidence GitHub App authentication without executing campaign mutations |
| Core provider readiness | Implemented as a bounded manual preflight | Existing object-store client verifies bucket access without writes; existing general email client submits one fixed explicitly confirmed message; a configured release run remains required |
| Alert readiness | Implemented as a protected bounded canary | Existing alerts-worker Redis and one exact production email, Slack, or webhook channel must satisfy failure coverage and backlog policy before accepting one fixed canary; a configured protected run remains required |
| Bundled dependency release identity | Implemented as an immutable manifest and final overlay | One ordered `linux/amd64` compatibility set binds PostgreSQL, Redis, Electric, ClickHouse, MinIO, registry, BusyBox, Docker socket proxy, Trigger.dev supervisor, and S2 to exact `@sha256` references and the exact application release; deployment configuration must match it exactly |
| Bundled blank-host acceptance | Implemented as a protected dedicated-runner harness | Official target publication and attestation, no-overwrite bundle manifest, unique migration/diagnostic/project/network/volume identities, exact pulls, install/migrate/start/doctor, complete teardown, and bounded source/release/bundle evidence; a configured successful run remains mandatory |
| Connected release campaign | Implemented as a fixed protected controller | Unchanged-main orchestration across bundle, lifecycle, providers, non-maintainer authoring, preview, human-governed promotion, production discovery/execution, webhook lifecycle, governed rollback, rollback production, and dossier assembly; one configured successful campaign remains mandatory |
| Immutable release dossier | Implemented for ten official sources | Schema `0.6` requires bundled clean-install, published self-host lifecycle, provider, alert, preview, promotion, production, webhook-production, rollback-proposal, and rollback-production artifacts from distinct successful `main` runs; it binds the exact application image to the immutable dependency manifest and clean teardown before lifecycle/connected acceptance, preserves exact archive/evidence digests, and creates one reviewable no-overwrite manifest PR |
| Self-host release identity | Implemented as an immutable manifest contract | One semantic release binds the exact FlowCordia and Trigger.dev revisions, immutable lowercase OCI digest, web and operations-worker identity, supported Node/pnpm versions, ordered repository migration inventory, and canonical manifest digest |
| Self-host runtime identity | Implemented as a default-off fail-closed startup/readiness gate | Every published web and operations-worker process must load one bounded regular non-symlink manifest, match an independently supplied manifest digest, application revision, image digest, Node runtime, component role, and exact web/worker process mode before work or readiness |
| Self-host image publication | Implemented as a protected no-overwrite publication contract | Exact `main` application and upstream revisions, version serialization, `linux/amd64` GHCR digest, Flowcordia OCI labels, BuildKit SBOM/provenance, GitHub-signed SLSA attestation, strict verification, canonical manifest, and bounded publication evidence; a configured protected run remains required |
| Production self-host application plane | Implemented as a validated single-host topology | One release-confirmed migration job applies and verifies Prisma, dashboard-agent Drizzle, and ClickHouse migrations; digest-bound web and operations replicas run read-only with migration skips, loopback HTTP, local/durable operations health, separated config/secrets, Compose rendering, and documented upgrade/rollback |
| Self-host diagnostics and support evidence | Implemented as a published-image bounded command and optional one-shot service | Shared strict release identity, exact live Prisma history, PostgreSQL, Redis, ClickHouse, Electric, object-store, email configuration, GitHub App, worker heartbeat, process-local readiness, internal/public web health, fixed states/messages, and owner-only no-overwrite schema `0.1` evidence; a configured exact-release run remains mandatory |
| Published self-host lifecycle acceptance | Implemented as a protected dedicated-runner two-release harness | Distinct successful official publication runs, exact target `main` identity, independent attestations, clean install, schema `0.2` no-overwrite migrations, startup, distinct restart diagnostics, backup/restore rehearsal, upgrade classification, target deployment, application rollback or restore-required boundary, teardown, and schema `0.1` bounded evidence; a configured successful run remains mandatory |
| Installation and operations | Partial | Real protected publication, bundled clean install, topology deployment, doctor artifact, controlled migration, lifecycle run, external dependency/provider evidence, complete connected campaign, queued alert-worker consumption, human acknowledgement/escalation, PITR, off-site recovery, load/outage proof, and HA remain required |

## Required connected acceptance record

A release candidate must preserve a sanitized record containing:

- FlowCordia application commit and canonical application release manifest digest;
- immutable bundled dependency manifest digest and compatibility version;
- successful blank-host installation and complete teardown identity;
- reference repository and immutable base commit;
- workflow ID and canonical digest;
- proposal ID, pull request number, and exact proposal head;
- generated artifact path and digest;
- preview environment identity and deployment version;
- version-locked live run friendly ID;
- validation suite digest and terminal result;
- policy version and digest selected for promotion;
- merge commit and promoted deployment version;
- signed webhook endpoint generation, activation revision, delivery outcome, revocation, and replacement outcome;
- rollback target and observed recovery result;
- official workflow run IDs, chronology, and bounded artifact digests;
- timestamps and named operator;
- confirmation that no payload, output, secret, token, worker database ID, actor identity, or raw provider error was recorded.

The record may reference provider URLs available only to authorized operators, but committed evidence must remain safe for a public repository.

## Stop-ship conditions

A release must stop when any of the following is true:

- the selected application release has no valid canonical manifest, uses a mutable application image, or its web, operations, diagnostics, runtime, application, upstream, or migration identity disagrees;
- the bundled dependency manifest is absent, overwriteable, digest-invalid, incomplete, reordered, bound to another application release, or contains any tag-only image;
- the supported Compose path can render an image reference that differs from the bundled manifest or bypasses the final immutable overlay;
- a bundled dependency digest is unavailable and has not been mirrored into an operator-controlled registry under a newly reviewed manifest;
- a published application image was not created by the protected exact-`main` workflow, its tag was overwritten, its registry digest differs, or its SLSA attestation cannot be verified;
- bundled clean-install acceptance reuses a workspace, project, migration path, diagnostics path, network, or volume, does not reach READY diagnostics, or leaves any container, network, or volume after teardown;
- config, secrets, application manifest, bundle manifest, migration state, or diagnostics state is committed, symbolic-linked, overlapping, unavailable, or permissioned outside the documented boundary;
- the one-shot migration job is not confirmed for the exact release, does not apply and verify every owned datastore, or does not preserve bounded completion evidence;
- a long-running web or operations replica can execute PostgreSQL, dashboard-agent, or ClickHouse migrations;
- the web process is exposed beyond the intended loopback/TLS ingress boundary;
- the operations local readiness pulse or durable installation heartbeat is unavailable or stale;
- a published process does not enforce the exact mounted application manifest and independently anchored digest before work;
- diagnostics are not READY for the exact published image and manifests or preserve values outside the bounded schema;
- migration completion evidence is overwriteable, missing its exact release/application/image/manifest/migration binding, or changes digest;
- the protected lifecycle does not use distinct successful official publication runs, the target does not equal the exact workflow `main` commit, or either attestation fails independent verification;
- clean install, migration/start/diagnostics, restart, recovery rehearsal, upgrade preflight, target deployment, rollback boundary, or teardown is not READY;
- application-only upgrade lacks a new previous-release rollback diagnostic, or a migration-bearing path starts the previous application on the forward-only schema;
- the connected campaign begins from another application SHA, allows `main` to move, retries an uncertain remote mutation, reconciles zero or multiple new official runs, or bypasses protected human governance;
- the non-maintainer author journey requires maintainer intervention or the proposal does not contain the exact workflow and generated source;
- production discovery cannot bind proposal, head, merge, deployment, closure digest/count, and rollback base identity through bounded authenticated Studio projections;
- the immutable release dossier is not schema `0.6`, omits the official bundled clean-install or self-host lifecycle source, uses fewer or more than ten distinct official runs, starts lifecycle before blank-host completion, starts connected acceptance before lifecycle completion, or binds evidence to another release/application/bundle lineage;
- the installation, live dependency, recovery, upgrade, release-candidate, launch-readiness, provider, or alert gate is blocked or unavailable;
- the connected preview deployment is skipped or cannot be tied to the exact proposal head;
- a run succeeds without trustworthy bounded node evidence;
- the production webhook cannot be bound to the exact promoted deployment, task, worker, and HMAC credential version;
- webhook revocation, replacement, and fail-closed ingress behavior have not been exercised;
- browser-visible or preserved evidence contains credentials, secret-like values, internal IDs, payloads, outputs, or raw provider errors;
- GitHub evidence is truncated, stale, unavailable, or belongs to another head;
- unsupported workflow intent is silently dropped;
- rollback has not been exercised for the exact release path;
- a required check is not green on the exact final commit;
- documentation claims a delivered connection that the preserved evidence does not prove.

## Evidence ownership

- The application release identity proves one canonical application, upstream, immutable OCI image, runtime, component, and migration identity. It does not identify bundled dependencies or prove installation.
- The bundled dependency manifest proves one ordered exact dependency image set belongs to one exact application release. It does not prove registry availability, installation, migration, health, upgrade, or teardown.
- Bundled clean-install evidence proves one protected empty-project installation pulled the exact application/dependency images, reached bounded diagnostics, and removed its containers, networks, and volumes. It does not prove upgrade, recovery, provider delivery, connected workflows, webhooks, load, or production support.
- Runtime identity enforcement proves the mounted application manifest and independently supplied deployment identity agree before web/worker startup and readiness. It does not prove registry provenance, dependency identity, database state, or connected execution.
- Image-publication evidence proves one exact `main` application image digest was built and pushed by the protected workflow with signed provenance. It does not execute migrations, configure deployment, prove dependencies, or replace acceptance.
- The production self-host topology proves one static single-host application-plane configuration separates credentials, binds roles to one digest/manifest, centralizes migrations, and exposes bounded readiness. It does not prove external reachability, inherited execution-plane completeness, HA, PITR, or a successful deployment.
- Self-host diagnostics proves the exact published image and application manifest agreed with one point-in-time bounded dependency/provider configuration and health projection. It does not prove durable writes, email delivery, repository permissions, execution, backup/restore, upgrade, rollback, load, outage, or incident response.
- Published lifecycle evidence proves one protected current-to-target application-plane journey from official artifacts, including restart, recovery rehearsal, upgrade kind, safe rollback behavior, and teardown. It does not prove connected workflow execution, provider delivery, public webhook behavior, production data restoration, load, HA, PITR, outage recovery, or support.
- The installation, live dependency, database recovery, controlled upgrade, release-candidate, provider, alert, and launch-readiness gates prove only their documented bounded observations and do not replace one another.
- The connected campaign controller proves a fixed orchestration path, exact-main dispatch reconciliation, bounded identity transfer between official stages, and one final controller receipt. It does not manufacture stage evidence, bypass protected reviewers, configure environments, or establish a release until every official stage succeeds.
- The connected acceptance stages prove non-maintainer authoring, preview execution, policy-governed promotion, production execution, signed webhook lifecycle, and governed rollback on one exact lineage.
- The immutable release dossier binds the official bundled clean-install, lifecycle, connected, and operator artifacts into one exact schema `0.6` lineage; it does not manufacture, execute, or replace source evidence.
- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.
- None of these evidence forms replaces the others.
