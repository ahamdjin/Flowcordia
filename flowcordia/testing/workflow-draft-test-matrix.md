# Workflow draft authoring test matrix

| Boundary | Required proof |
| --- | --- |
| editor catalog | only the reviewed first-party manual/schedule/webhook/HTTP/condition/wait/code/output templates are exposed |
| deterministic identity | repeated node/edge additions allocate stable collision-safe canonical IDs |
| immutability | an edit never mutates its source workflow object |
| canonical validation | every edit result passes `@flowcordia/workflow`; invalid results fail closed with issues |
| node lifecycle | add, move, rename, and remove work; removing a node removes connected edges atomically |
| graph lifecycle | connect creates one deterministic edge; self/duplicate/missing references are rejected; remove edge is exact |
| command validation | only start/edit/discard and the bounded edit union are accepted; IDs, UUID, version, strings, labels, coordinates, and templates are bounded |
| tenant isolation | every draft query/update/discard includes organization, project, installation, repository, owner/name, and branch predicates |
| source proof | creation rereads the exact indexed commit and verifies commit, blob, path, workflow ID, and canonical SHA-256 |
| source drift | edits are rejected when the durable index no longer matches the immutable draft base |
| optimistic concurrency | exact expected version increments once; stale versions change nothing and return conflict |
| integrity | stored JSON validates and recomputed SHA-256 equals the stored document hash before use |
| active uniqueness | at most one active draft exists per project/repository/workflow under concurrent starts |
| discard | exact-version discard is terminal, auditable, and leaves no active row for that workflow |
| audit redaction | audit payloads contain command/entity/version/hash metadata, never full document or configuration values |
| browser DTO | public UUID/version/hash/base commit/timestamps/stale and redacted graph only; no storage/tenant/install/actor/base-blob/config values |
| UI editing | start/resume, add node, drag/move, workflow details, rename, connect, remove edge/node, and discard submit exact versioned commands |
| UI conflict posture | failed/conflicting commands revalidate durable truth; source/index drift disables editing |
| build compatibility | root typecheck/export validation, formatting, lint, production webapp build, E2E, package tests, and webapp tests pass |
| isolation | no new import or call into Trigger.dev run engine, queues, supervisor, deployment, CLI, or customer execution paths |

## Manual acceptance

1. Synchronize a repository containing a valid workflow.
2. Start editing and confirm draft version `1`.
3. Add each supported template and verify stable IDs and configuration key names only.
4. Drag a node and confirm one snapped position save/version increment.
5. Rename nodes and workflow metadata; connect and remove edges; remove a connected node.
6. Open a second session and prove a stale expected version is rejected.
7. Change the Git workflow, synchronize, and prove the draft is inspectable but not editable.
8. Discard and restart from the new source.
9. Inspect GitHub and prove no branch, commit, pull request, deployment, or run was created.
