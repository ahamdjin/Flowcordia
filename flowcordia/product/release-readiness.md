# Release readiness

This document separates implemented contracts from production evidence. FlowCordia must not claim a maturity level that its preserved evidence does not support.

## Current stage

**Internal alpha**

The repository contains a connected architecture for repository workflow discovery, durable Studio drafts, deterministic compilation, governed GitHub proposals, typed repository functions, signed production webhooks, preview deployment correlation, exact-head validation, policy evidence, promotion, bounded operator release gates, immutable self-host release identity, fail-closed runtime identity enforcement, protected attested image publication, a validated single-host production application plane, published-image bounded diagnostics, immutable migration completion evidence, and a protected two-release lifecycle acceptance harness.

The remaining release risk is primarily a configured successful protected lifecycle execution, preserved connected acceptance, configured operator evidence, inherited execution-plane installation, supported recovery objectives, provider operating evidence, and production experience—not missing workflow identity, release provenance, migration isolation, application-plane topology, or a diagnostics contract.

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
- immutable release artifacts and versioned migrations bound to one canonical release manifest and enforced by every advertised runtime component;
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
| Core provider readiness | Implemented as a bounded manual preflight | Existing object-store client verifies bucket access without writes; existing general email client submits one fixed explicitly confirmed message; a configured release run remains required |
| Alert readiness | Implemented as a protected bounded canary | Existing alerts-worker Redis and one exact production email, Slack, or webhook channel must satisfy failure coverage and backlog policy before accepting one fixed canary; a configured protected run remains required |
| Immutable release dossier | Implemented for eight official sources | Schema `0.4` binds provider, alert, preview, promotion, production, webhook-production, rollback-proposal, and rollback-production artifacts from distinct successful `main` runs with exact application lineage, ordering, freshness, archive/evidence digests, and one reviewable no-overwrite manifest PR |
| Self-host release identity | Implemented as an immutable manifest contract | One semantic release binds the exact FlowCordia and Trigger.dev revisions, immutable lowercase OCI digest, web and operations-worker identity, supported Node/pnpm versions, ordered repository migration inventory, and canonical manifest digest |
| Self-host runtime identity | Implemented as a default-off fail-closed startup/readiness gate | Every published web and operations-worker process must load one bounded regular non-symlink manifest, match an independently supplied manifest digest, application revision, image digest, Node runtime, component role, and exact web/worker process mode before work or readiness |
| Self-host image publication | Implemented as a protected no-overwrite publication contract | Exact `main` application and upstream revisions, version serialization, `linux/amd64` GHCR digest, Flowcordia OCI labels, BuildKit SBOM/provenance, GitHub-signed SLSA attestation, strict verification, canonical manifest, and bounded publication evidence; a configured protected run remains required |
| Production self-host application plane | Implemented as a validated single-host topology | One release-confirmed migration job applies and verifies Prisma, dashboard-agent Drizzle, and ClickHouse migrations; digest-bound web and operations replicas run read-only with migration skips, loopback HTTP, local/durable operations health, separated config/secrets, Compose rendering, and documented upgrade/rollback |
| Self-host diagnostics and support evidence | Implemented as a published-image bounded command and optional one-shot service | Shared strict release identity, exact live Prisma history, PostgreSQL, Redis, ClickHouse, Electric, object-store, email configuration, GitHub App, worker heartbeat, process-local readiness, internal/public web health, fixed states/messages, and owner-only no-overwrite schema `0.1` evidence; a configured exact-release run remains mandatory |
| Published self-host lifecycle acceptance | Implemented as a protected dedicated-runner two-release harness | Distinct successful official publication runs, exact target `main` identity, independent attestations, clean install, schema `0.2` no-overwrite migrations, startup, distinct restart diagnostics, backup/restore rehearsal, upgrade classification, target deployment, application rollback or restore-required boundary, teardown, and schema `0.1` bounded evidence; a configured successful run remains mandatory |
| Installation and operations | Partial | A real protected image publication, topology deployment, doctor artifact, controlled migration, successful lifecycle run, external dependency/provider evidence, inherited Trigger.dev execution-plane installation, connected acceptance, queued alert-worker consumption, human acknowledgement/escalation, PITR, off-site recovery, and HA remain required |

## Required connected acceptance record

A release candidate must preserve a sanitized record containing:

- FlowCordia application commit;
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
- timestamps and named operator;
- confirmation that no payload, output, secret, token, worker database ID, actor identity, or raw provider error was recorded.

The record may reference provider URLs available only to authorized operators, but the committed evidence must remain safe for a public repository.

## Stop-ship conditions

A release must stop when any of the following is true:

- the selected self-host release has no valid canonical manifest, uses a mutable image tag, or its web, operations-worker, diagnostics, image, runtime, application, upstream, or migration identity disagrees;
- a published image was not created by the protected exact-`main` workflow, its version tag was overwritten, its registry digest differs, or its SLSA attestation cannot be verified against the exact repository, signer workflow, source commit, source ref, and GitHub-hosted runner policy;
- the image publication manifest, attestation bundle, bounded evidence artifact, or diagnostics command is missing, malformed, unsafe, or belongs to another release;
- an advertised platform differs from the evidenced `linux/amd64` release image;
- the production topology validator is not READY for the exact config, secrets, manifest, image, and application identities;
- config, secrets, manifest, migration-state, or diagnostics-state paths are committed, symbolic links, overlapping, unavailable, or permissioned outside the documented boundary;
- the one-shot migration job is not confirmed for the exact release, does not apply and verify every owned datastore, or does not preserve bounded completion evidence;
- a long-running web or operations replica can execute PostgreSQL, dashboard-agent, or ClickHouse migrations;
- a published application or diagnostics process requires a writable root filesystem or the image is missing packaged Prisma/runtime/diagnostics artifacts;
- the web process is exposed beyond the intended loopback/TLS ingress boundary;
- the operations local readiness pulse or durable installation heartbeat is unavailable or stale;
- a published web, operations-worker, migration, or diagnostics process does not enforce the exact mounted manifest and independently anchored digest before work;
- the web process enables proposal operations or disables HTTP, or the operations process serves HTTP, enables Studio, or leaves proposal operations disabled;
- the release diagnostics command is not READY for the exact published image and manifest, is executed from another revision, or records values outside the bounded schema;
- a diagnostics artifact was overwritten, is group/world-readable, is stored inside the repository, or its evidence digest changed;
- migration completion evidence is schema `0.1`, overwriteable, missing its exact release/application/image/manifest/migration binding, or its schema `0.2` digest changes;
- the protected lifecycle workflow does not use distinct successful official publication runs, the target run does not equal the exact workflow `main` commit, or either attestation fails independent verification;
- the lifecycle runner is not the dedicated UID `1000` self-hosted release runner, reuses a prior workspace/project/output, or runs against shared production dependencies;
- clean install, current migration/start/diagnostics, idempotent restart, recovery rehearsal, upgrade preflight, target migration/start/diagnostics, rollback boundary, or teardown is not READY;
- application-only upgrade lacks a new previous-release rollback diagnostic, or a migration-bearing path starts the previous application on the forward-only schema;
- lifecycle containers or application network remain after teardown, or final lifecycle evidence contains unbounded fields, mixed lineage, reused evidence, invalid chronology, or a changed digest;
- the installation preflight is blocked for the selected web, worker, or release profile;
- the live dependency preflight is blocked or unavailable for the selected profile;
- no matching PostgreSQL backup manifest and successful isolated restore rehearsal exist for the exact release artifact;
- the controlled upgrade preflight is blocked or unavailable for the exact current/candidate transition;
- the release-candidate evidence gate is not READY for the exact release, current revision, and target revision;
- core provider readiness is blocked or unavailable for the exact release application;
- alert readiness is blocked or unavailable for the exact release application and selected production channel;
- the connected preview deployment is skipped or cannot be tied to the exact proposal head;
- a run succeeds without trustworthy bounded node evidence;
- the production webhook cannot be bound to the exact promoted deployment, task, worker, and HMAC credential version;
- webhook revocation, replacement, and fail-closed ingress behavior have not been exercised for the release path;
- browser-visible data contains credentials, secret-like values, internal IDs, or raw provider errors;
- GitHub evidence is truncated, stale, unavailable, or belongs to another head;
- unsupported workflow intent is silently dropped;
- an ambiguous remote mutation is retried without reconciliation;
- the rollback procedure has not been exercised for the release path;
- a required check is not green on the exact final commit;
- documentation claims a delivered connection that the acceptance record does not prove.

## Evidence ownership

- The self-host release identity proves one canonical application, upstream, immutable OCI image, runtime, component, and repository migration identity. It does not publish an image, prove registry availability, configure an installation, execute migrations, or replace release acceptance.
- Runtime identity enforcement proves the mounted release manifest and independently supplied deployment identity agree before web/worker startup and web readiness. It does not prove registry provenance, image signatures, database migration state, external dependency health, or connected execution.
- Image-publication evidence proves one exact `main` image digest was built and pushed by the protected workflow with Flowcordia/upstream labels, BuildKit SBOM/provenance, a GitHub-signed SLSA attestation, strict post-push verification, and a matching canonical manifest. It does not execute migrations, configure deployment, prove dependencies, or replace connected acceptance.
- The production self-host topology proves one static single-host application-plane configuration separates protected credentials, binds every role to one digest/manifest, runs every owned migration in one confirmed phase, keeps long-running replicas immutable and migration-disabled, and exposes bounded readiness. It does not prove external service reachability, inherited execution-plane completeness, HA, PITR, or a successful production deployment.
- Migration completion evidence proves one invocation reached the terminal success point after all three owned migration systems reported success. It does not replace backup/restore, upgrade classification, schema compatibility, or connected acceptance evidence.
- Self-host diagnostics proves the exact published image and manifest agreed with one point-in-time set of bounded release, database, transport, provider-configuration, GitHub App, worker, and web-health checks. It does not mutate providers, send email, prove durable object writes, prove repository permissions, install the execution plane, execute a workflow, verify rollback, or establish service objectives.
- The diagnostics artifact proves only the fixed schema `0.1` projection and evidence digest preserved at one time. It does not replace logs, provider delivery, recovery, upgrade, connected, webhook, rollback, load, outage, or incident-response evidence.
- Migration completion evidence proves one exact image invocation completed every owned datastore transition for one manifest and migration inventory without overwriting prior proof. It does not prove backup, compatibility, startup, provider health, or rollback safety.
- Published lifecycle evidence proves one protected disposable current-to-target application-plane journey from official artifacts, including restart, recovery rehearsal, upgrade kind, safe rollback behavior, and teardown. It does not prove inherited workflow execution, provider delivery, public webhook behavior, production data restoration, load, HA, PITR, outage recovery, or production support.
- The installation preflight proves only deterministic configuration shape and safe rollout defaults. It never proves network reachability, provider credentials, migration state, or runtime health.
- The live dependency preflight proves point-in-time PostgreSQL reachability, exact migration compatibility, GitHub App authentication, and required worker heartbeat without exposing provider data. It does not prove repository permissions, project backlog health, backups, or end-to-end execution.
- Database recovery evidence proves one exact custom archive can be restored into and removed from a disposable compatible PostgreSQL database with exact migration parity. It does not prove PITR, object storage, encryption-key recovery, RPO/RTO, or cross-region disaster recovery.
- Controlled upgrade preflight proves one observed live migration history is an exact checksum-bound prefix of the candidate and that required evidence and acknowledgements exist. It does not mutate the installation, prove supplied current application identity independently, or prove backward database compatibility.
- The release-candidate gate proves the existing dependency, recovery, and upgrade evidence agrees on one exact release lineage, chronology, freshness policy, and rollout sequence. It does not run those probes or replace connected acceptance.
- Provider readiness proves point-in-time bucket access and general product-email provider acceptance through inherited clients. It does not prove durable object writes, inbox delivery, quotas, retention, or disaster recovery.
- Alert readiness proves point-in-time alerts-worker Redis reachability, exact production channel/backlog readiness, and direct acceptance of one fixed canary through the existing alert email, Slack, or webhook adapter. It does not prove queued-worker consumption, inbox or Slack visibility, downstream webhook processing, acknowledgement, escalation, or incident response.
- Repository CI proves code, contracts, deterministic artifacts, builds, and repository test environments.
- The connected acceptance run proves application configuration, GitHub installation, preview build, deployment discovery, task execution, evidence projection, promotion, signed production webhook behavior, and rollback.
- The immutable release dossier binds official source artifacts; it does not manufacture or replace any source evidence.
- None of these evidence forms replaces the others.
