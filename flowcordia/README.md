# FlowCordia engineering index

FlowCordia is a Git-native workflow platform built on the Trigger.dev execution foundation. It adds a visual Studio, portable typed workflow contracts, governed GitHub collaboration, exact-head runtime evidence, signed production ingress, and an enterprise control plane without duplicating the durable run engine.

**Current maturity:** internal alpha. Repository contracts and tests are strong; a preserved connected reference release acceptance record remains a release gate.

## Start here

- [`product/enterprise-blueprint.md`](product/enterprise-blueprint.md) — product promise and primary users.
- [`product/capability-matrix.md`](product/capability-matrix.md) — delivered, partial, inherited, and planned capability coverage.
- [`product/release-readiness.md`](product/release-readiness.md) — maturity stages, release gates, and stop-ship conditions.
- [`architecture/README.md`](architecture/README.md) — planes, ownership, and implemented contracts.
- [`architecture/public-webhook-ingress-route.md`](architecture/public-webhook-ingress-route.md) — signed production webhook host boundary.
- [`architecture/webhook-operations.md`](architecture/webhook-operations.md) — permanent revocation and bounded delivery evidence.
- [`architecture/webhook-endpoint-replacement.md`](architecture/webhook-endpoint-replacement.md) — safe successor identities for revoked public endpoints.
- [`connections/README.md`](connections/README.md) — live component-to-component connection registry.
- [`runbooks/installation-preflight.md`](runbooks/installation-preflight.md) — secret-safe web, worker, and release configuration gate plus install/upgrade order.
- [`runbooks/live-dependency-preflight.md`](runbooks/live-dependency-preflight.md) — bounded PostgreSQL, migration, GitHub App, and worker-heartbeat proof.
- [`runbooks/database-backup-restore.md`](runbooks/database-backup-restore.md) — versioned PostgreSQL archive and isolated restore rehearsal.
- [`runbooks/controlled-upgrades.md`](runbooks/controlled-upgrades.md) — checksum-bound application and schema upgrade decision plus rollout order.
- [`runbooks/self-host-release-identity.md`](runbooks/self-host-release-identity.md) — immutable application, image, runtime, component, and migration identity for self-host distribution.
- [`runbooks/release-candidate-gate.md`](runbooks/release-candidate-gate.md) — exact dependency, recovery, and upgrade evidence binding before connected acceptance.
- [`runbooks/provider-readiness.md`](runbooks/provider-readiness.md) — live object-store access and explicitly confirmed product-email provider acceptance.
- [`runbooks/alert-readiness.md`](runbooks/alert-readiness.md) — protected alerts-worker Redis, production-channel, backlog, and fixed delivery-adapter canary.
- [`runbooks/webhook-production-acceptance.md`](runbooks/webhook-production-acceptance.md) — protected signed delivery, replay, revocation, replacement, successor, and predecessor-isolation proof.
- [`runbooks/release-acceptance.md`](runbooks/release-acceptance.md) — connected browser-to-runtime-to-rollback acceptance procedure.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — FlowCordia-specific PR and validation discipline.

## Source-of-truth rules

- Trigger.dev remains the execution foundation until a decision record explicitly replaces a subsystem.
- Git is the durable history for workflow definitions, generated artifacts, reviews, releases, and rollbacks.
- The FlowCordia workflow model is the contract shared by Studio, code tooling, GitHub adapters, and runtime generation.
- Secrets never enter workflow files, generated source, audit payloads, or browser projections.
- Public webhook execution resolves one immutable active binding; it never discovers a mutable latest deployment at request time.
- Every new subsystem documents what it connects to, why the connection exists, who owns it, and how it fails.
- Repository CI and connected acceptance are separate required evidence; neither replaces the other.

## Folder map

- `product/` — product promise, maturity, capability coverage, and delivery order.
- `architecture/` — system boundaries and contracts between planes.
- `connections/` — the live registry of component-to-component connections.
- `decisions/` — architecture decisions and rejected alternatives.
- `security/` — trust, identity, authorization, secret, and browser-data boundaries.
- `testing/` — contract, failure, integration, and acceptance matrices.
- `runbooks/` — validation, rollout, release, recovery, and rollback procedures.
- `specs/` — machine-readable contracts beginning with workflow schema `0.1`.
- `research/` — evidence gathered from the inherited Trigger.dev repository.

## Completion rule

A FlowCordia feature is not complete until:

1. its configuration and browser interaction are explicit;
2. input, output, identity, authorization, and secret boundaries are validated;
3. serialization and compilation are deterministic;
4. execution and observability use the intended owning platform services;
5. failure, retry, idempotency, timeout, and ambiguous outcomes are known;
6. repository and connected-environment evidence are distinguished honestly;
7. rollout and rollback are documented and testable;
8. the connection registry, machine-readable catalog, public README, and capability matrix match delivered behavior;
9. the change is tied to one reviewed branch, commit, and pull request;
10. no Trigger.dev core behavior changed without an explicit decision record.
