# Delivery roadmap

## Phase 0 — Repository and contracts

- Preserve the Trigger.dev runtime boundary.
- Establish architecture, connection, decision, and runbook folders.
- Define workflow schema v0.
- Consolidate the hidden setup-status route.

Exit: documentation is reviewable, the setup route type-checks, and no core runtime behavior changes.

## Phase 1 — Studio vertical slice

- Read and render workflow schema v0.
- Add manual, schedule, webhook, HTTP, condition, wait, code, and output nodes.
- Save changes to a GitHub branch.
- Generate a visual diff and typed code artifact.
- Deploy to a preview environment and show live run state.

Exit: canvas-to-Git-to-runtime-to-canvas works for one real workflow.

## Phase 2 — Developer bridge

- Add custom typed functions as visual nodes.
- Add code editing, tests, fixtures, and mocks.
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

