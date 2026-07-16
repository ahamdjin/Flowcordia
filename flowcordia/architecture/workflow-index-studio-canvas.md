# Repository workflow index and read-only Studio canvas

## Purpose

This slice makes the first Flowcordia workflow experience depend on real, connected repository state. It discovers canonical workflow files from the project production branch, validates every document at one immutable commit, replaces a durable repository index transactionally, and renders only a source identity that can be re-proven against GitHub.

It does not edit, compile, deploy, or execute workflows.

## End-to-end connection

```text
ConnectedGithubRepository + branchTracking
  -> signed GitHub push webhook or authorized Studio synchronize command
  -> flowcordia.workflow_index_sync durable request + generation
  -> no-overlap worker or exact request claim
  -> installation-scoped GitHub tree discovery at one commit
  -> @flowcordia/github-workflows exact commit/blob/path reads
  -> @flowcordia/workflow validation and migration
  -> transactional index replacement + audit
  -> authorized Studio query
  -> exact GitHub reread + canonical digest proof
  -> browser-safe graph DTO
  -> read-only node/edge canvas and inspector
```

## Ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| `GitHubWorkflowCatalog` | bounded discovery under `.flowcordia/workflows` | credentials, tenant authorization, writes |
| workflow-index repository | durable sync intent, leases, entries, audit, webhook dedupe | GitHub content or browser DTOs |
| index service | exact-commit discovery, validation, all-or-nothing replacement | UI authorization or workflow execution |
| push ingestion | signed-delivery projection into exact sync requests | trusting branch names from the browser |
| Studio query | server-owned scope and exact indexed source verification | credentials, internal IDs, raw provider errors |
| Studio canvas | read-only presentation of proven graph structure | edits, saves, compilation, deployment, execution |

## Durable schema

The index uses the dedicated PostgreSQL schema `flowcordia` rather than extending inherited Trigger.dev models with unrelated fields.

- `workflow_index_sync`: one project/repository synchronization aggregate, generation, exact requested/observed commit, lease, counts, and safe failure.
- `workflow_index_entry`: one validated or invalid workflow identity per repository path and workflow ID.
- `workflow_index_audit_event`: append-only, secret-free lifecycle evidence.
- `workflow_index_webhook_delivery`: delivery ID + payload hash replay protection for push events.

Cross-schema foreign keys bind the index to the existing organization, project, GitHub App installation, and repository records.

## Safety invariants

1. The browser never supplies organization, project, installation, repository, branch, actor, generation, lock token, or GitHub client identity.
2. Discovery resolves a branch once and lists one immutable commit.
3. Every workflow is reread through `GitHubWorkflowStore` at that exact commit.
4. A truncated tree, oversized catalog, unavailable read, identity mismatch, or non-validation error leaves the previous catalog untouched.
5. Invalid workflow documents are indexed as invalid; they are visible but never rendered.
6. Catalog replacement requires the exact synchronization generation and lease token.
7. Absent entries are deleted only in the same transaction that commits a complete replacement snapshot.
8. Studio rereads the indexed commit and proves commit, blob, path, workflow ID, and canonical SHA-256 before rendering.
9. The browser DTO exposes configuration keys and credential reference names, never configuration values, credentials, provider errors, or storage IDs.
10. The worker is part of the existing default-off Flowcordia operations lifecycle and imports no Trigger.dev run engine, queue, supervisor, deployment, or customer workload modules.

## Failure model

- Safe transient GitHub failures mark the sync failed without replacing the last good catalog.
- Push delivery replay with the same ID and different bytes is rejected as a security mismatch.
- A crash after delivery receipt can be retried from the same verified payload; already scheduled or ignored deliveries are idempotent.
- Expired worker leases can be reclaimed with `FOR UPDATE SKIP LOCKED`.
- A new generation invalidates an older worker completion.
- Manual synchronization claims only the exact row and generation it just requested.

## Product boundary

This PR deliberately provides a useful read path before editing:

- discover real workflows;
- see valid and invalid documents;
- synchronize on demand;
- receive push-driven updates;
- inspect nodes, edges, operations, runtime hints, credential references, and code references;
- prove the exact Git source shown on screen.

Editing, proposals from canvas changes, bidirectional code generation, compilation, deployment, and live run state remain separate review boundaries.
