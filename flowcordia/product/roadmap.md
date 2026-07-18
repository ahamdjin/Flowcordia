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
- Add manual, schedule, webhook, HTTP, condition, wait, code, and output nodes. — delivered as a bounded first catalog
- Save workflow and generated task changes to a governed GitHub branch. — delivered
- Show visual change summary and structural test traces. — delivered
- Generate a visual diff and typed code artifact. — delivered
- Deploy to a preview environment and show live run state. — delivered for the connected GitHub integration, exact-head deployment, manual live run, and bounded node-state path

Exit: canvas-to-Git-to-runtime-to-canvas works for one real workflow. — implemented; live rollout proof still requires a configured connected repository and preview build

## Phase 2 — Developer bridge

- Add custom typed functions as visual nodes. — delivered for exact-commit manifests, removable reviewed workflow references, compile-time export contracts, runtime schema enforcement, and a generated reference-repository fixture
- Add schema-driven repository-function testing. — delivered for recursive forms, exact client/runtime validation, structural versus live modes, advanced JSON fallback, structured output, and non-persistent sensitive inputs
- Add repository-owned structural fixtures and deterministic mocks. — delivered through the exact-commit function catalog with server-owned mock resolution
- Add governed repository source-patch publication. — delivered for bounded JavaScript/TypeScript changes, exact blob identity, resumable multi-file publication, ambiguous-write reconciliation, and final-head proof
- Add durable Studio source buffers and reviewed code editing. — delivered with exact commit/blob identity, optimistic source state, combined proposal publication, and source-safe audit boundaries
- Add executable developer-provided function validation. — delivered for server-owned exact-head suites, same-build Trigger.dev execution, canonical digest verification, status-only Studio projection, and promotion blocking
- Support subflows, batching, parallelism, approvals, and streaming.
- Detect unsupported code and preserve it as a code-task boundary.

Exit: developers and visual builders can safely collaborate on the same pull request.

## Phase 3 — Enterprise governance

- SSO/SCIM, granular RBAC, audit, policies, approvals, retention, and external secrets.
- GitHub Enterprise Cloud and Server support.
- Signed internal node catalog and controlled promotion across environments.

Exit: a regulated organization can govern workflow delivery without bypass paths.

## Phase 4 — Enterprise runtime and self-hosting

- Guided installation, health checks, upgrades, backup, and recovery.
- Worker autoscaling adapters, regional placement, and high availability.
- Close documented self-host gaps without forking core behavior casually.

Exit: production operators can run and upgrade Flowcordia predictably on customer infrastructure.
