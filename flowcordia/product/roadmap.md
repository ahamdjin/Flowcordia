# Delivery roadmap

## Phase 0 — Repository and contracts

- Preserve the Trigger.dev runtime boundary.
- Establish architecture, connection, decision, and runbook folders.
- Define workflow schema v0.
- Consolidate the hidden setup-status route.

Exit: documentation is reviewable, the setup route type-checks, and no core runtime behavior changes.

## Phase 1 — Studio vertical slice

Delivered foundation: Studio can inspect repository workflows, persist visual drafts, edit allow-listed visual configuration, preserve developer-owned code boundaries, run side-effect-free preview traces, compile deterministic Trigger.dev task source, and publish an exact draft version into the governed Git/PR lifecycle. The proposal workspace can submit or promote an exact observed head.

- Read and render workflow schema v0. — delivered
- Add manual, authenticated API, schedule, webhook, HTTP, condition, wait, code, and output nodes. — delivered as a bounded first catalog
- Save workflow and generated task changes to a governed GitHub branch. — delivered
- Show visual change summary and structural test traces. — delivered
- Generate a visual diff and typed code artifact. — delivered
- Deploy to a preview environment and show live run state. — delivered for the connected GitHub integration, exact-head deployment, manual live run, bounded node-state path, and exact-worker closure installation proof
- Bind reviewed schedule triggers to production declarative schedules without activating them in proposal previews. — delivered
- Bind API-triggered workflows to the inherited authenticated task endpoint with project RBAC, payload limits, and idempotency. — delivered
- Bind bounded trigger-owned retry policy to whole-workflow Trigger.dev task retries. — delivered
- Bind trigger-owned queue, machine, and maximum duration to the whole generated task, while rejecting node-scoped policy and invocation-time concurrency keys. — delivered
- Add a manual connected-repository readiness probe covering the exact GitHub App installation, minimum permissions, production head, workflow catalog/index, Trigger.dev generated-task discovery, and preview deployment setting. — delivered
- Replace the disconnected Studio dead end with permission-aware GitHub installation, project-integration, repository-selection, and synchronization guidance. — delivered; repository readiness remains the authoritative connected check
- Replace the single manual-only bootstrap with versioned manual, authenticated-API transformation, and scheduled durable-wait starter templates that validate and compile before proposal creation. — delivered; connected execution remains required
- Add a protected manual connected-acceptance harness for readiness, existing-draft structural preview, and existing-READY-proposal exact-head live proof with sanitized evidence only. — delivered; an authenticated environment run is still required to create the record
- Add a protected governed-promotion acceptance harness requiring exact reference-repository identity, explicit destructive confirmation, `SATISFIED` policy evidence, and the existing server-owned promotion command. — delivered; a protected environment run is still required, and production/rollback proof remains separate
- Add exact production execution proof for the latest merged proposal, authoritative production deployment, complete promoted closure inventory, worker-version lock, explicit confirmation, non-sensitive payload, and trusted node evidence. — delivered; connected protected-environment execution remains required
- Bind release evidence to a reference workflow containing approved HTTP, deterministic mapping, and at least one ready credential binding. — delivered in schema `0.2`; a real protected preview artifact remains required

Exit: canvas-to-Git-to-runtime-to-canvas works for one real workflow. — implementation and prerequisite readiness probe delivered with exact proposal/head/merge/worker/closure correlation; the authenticated connected-repository execution, promotion, and rollback acceptance record remains mandatory

## Phase 2 — Developer bridge

- Add custom typed functions as visual nodes. — delivered for exact-commit manifests, removable reviewed workflow references, compile-time export contracts, runtime schema enforcement, and a generated reference-repository fixture
- Add project-environment credential readiness and write-only rotation. — delivered for reviewed HTTP references using inherited encrypted environment storage, status-only reads, separate env-tier read/write authorization, and bounded header contracts
- Add schema-driven repository-function testing. — delivered for recursive forms, exact client/runtime validation, structural versus live modes, advanced JSON fallback, structured output, and non-persistent sensitive inputs
- Add repository-owned structural fixtures and deterministic mocks. — delivered through the exact-commit function catalog with server-owned mock resolution
- Add governed repository source-patch publication. — delivered for bounded JavaScript/TypeScript changes, exact blob identity, resumable multi-file publication, ambiguous-write reconciliation, and final-head proof
- Add durable Studio source buffers and reviewed code editing. — delivered with exact commit/blob identity, optimistic source state, combined proposal publication, and source-safe audit boundaries
- Add executable developer-provided function validation. — delivered for server-owned exact-head suites, same-build Trigger.dev execution, canonical digest verification, status-only Studio projection, and promotion blocking
- Add deterministic data mapping between visual nodes. — delivered for bounded source paths, scalar literals, merge/replace modes, structural preview, and live execution without arbitrary expressions
- Support subflows, batching, parallelism, approvals, and streaming. — typed version-locked child invocation, bounded same-child batch fan-out, exact-index child selection, missing/invalid target checks, repository-wide cycle prevention, exact trigger/output callable contract binding, immutable root-to-leaf proposal closure, durable closure identity, exact preview-worker installation proof, and exact production-worker closure activation proof delivered; approvals, streaming batches, and mixed-child parallelism remain
- Detect unsupported code and preserve it as a code-task boundary.

Exit: developers and visual builders can safely collaborate on the same pull request.

## Phase 3 — Enterprise governance

- Repository-scoped proposal policy, immutable current-head/self-approval floor, monotonic writer strengthening, exact-head evidence, and correlated promotion audit. — delivered as the first governance slice
- SSO/SCIM, granular RBAC, audit, policies, approvals, retention, and external secrets.
- GitHub Enterprise Cloud and Server support.
- Signed internal node catalog and controlled promotion across environments.

Exit: a regulated organization can govern workflow delivery without bypass paths.

## Phase 4 — Enterprise runtime and self-hosting

- Deterministic web, worker, and release configuration preflight with secret-safe output and install/upgrade ordering. — delivered
- Non-destructive live dependency preflight for the PostgreSQL writer, exact migration set, GitHub App identity, and durable proposal-worker heartbeat. — delivered; repository scope and broader runtime health remain
- Versioned PostgreSQL custom backup plus isolated create/restore/verify/drop rehearsal with redacted evidence. — delivered; configured operator execution, PITR, off-site replication, and cross-region DR remain
- Read-only controlled upgrade decision for exact application revisions, checksum-bound Prisma history, recovery evidence, acknowledgements, and worker-first rollout. — delivered; automated mutation and explicit cross-version database compatibility remain
- Existing-client provider readiness for read-only object-store bucket access and one explicitly confirmed general product-email acceptance send. — delivered; inbox delivery, durable object write/read/delete, provider quotas, and retention remain
- Protected alert readiness for the inherited alerts-worker Redis, one exact production channel, pending-backlog policy, and one explicitly confirmed fixed email/Slack/webhook canary. — delivered; queued-worker consumption, downstream visibility, acknowledgement, escalation, and incident drills remain
- Guided installation, health checks, upgrades, backup, and recovery.
- Worker autoscaling adapters, regional placement, and high availability.
- Close documented self-host gaps without forking core behavior casually.

Exit: production operators can run and upgrade Flowcordia predictably on customer infrastructure.
