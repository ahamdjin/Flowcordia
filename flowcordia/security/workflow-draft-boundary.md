# Workflow draft security boundary

## Trust boundary

The Studio browser is untrusted for tenancy and source identity. It may request a bounded edit against one public draft UUID and expected version. It may not choose organization, project, GitHub installation, repository, branch, database identity, actor, source commit, source blob, canonical source hash, or credentials.

The server resolves and rechecks the signed-in project and connected repository before every command.

## Required proofs

A new draft requires:

1. an authorized GitHub-write user with Studio feature access;
2. one valid durable workflow-index entry in the current repository scope;
3. an installation-scoped GitHub reread at the exact indexed commit;
4. matching commit, blob, path, workflow ID, and canonical SHA-256;
5. successful canonical workflow validation.

An edit additionally requires:

1. an active draft in the same full repository scope;
2. the exact expected optimistic version;
3. an unchanged indexed base identity;
4. one allow-listed edit command;
5. successful validation and integrity hashing of the resulting document.

## Data exposure

The browser draft DTO includes only:

- public draft UUID;
- workflow ID;
- optimistic version;
- document SHA-256;
- base commit SHA;
- creation/update timestamps;
- stale flag;
- redacted graph structure.

It excludes internal row IDs, tenant/project/install/repository IDs, actor IDs, base blob SHA, full workflow JSON, configuration values, credentials, raw provider errors, SQL details, and audit payloads.

The graph may show configuration key names and credential reference names because those are structural workflow metadata. It never includes the referenced credential or configuration value.

## Command limits

The command resource accepts only start, edit, and discard. Edit is a discriminated union of workflow details, add/move/rename/remove node, connect nodes, and remove edge. IDs, strings, labels, coordinates, templates, UUIDs, and versions are bounded before service execution.

There is no raw JSON document replacement endpoint. This prevents the browser from bypassing deterministic edit semantics or smuggling unknown properties into durable state.

## Audit and logging

Draft audit events contain public identity, workflow identity, versions, integrity hashes, source hashes, command type, and affected entity IDs. They must not contain the full document, configuration values, credential values, request bodies, internal lock/storage identities, or raw GitHub errors.

Operational logs should record normalized error code, public draft ID, workflow ID, correlation ID, and version only.

## Failure posture

- Version conflict: fail closed and reload durable truth.
- Source drift: keep the draft inspectable, block edits, require explicit discard/restart.
- Corrupt stored document or hash mismatch: block rendering/editing and treat as an operational integrity incident.
- GitHub outage during draft creation: do not create a draft from unproven content.
- Database uncertainty: return a normalized failure; never issue a Git mutation as compensation.
- Permission or repository-binding change: reject before accessing or mutating the draft.
