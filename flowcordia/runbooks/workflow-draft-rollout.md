# Workflow draft authoring rollout

## Preconditions

- The stacked workflow-index and read-only Studio slice is deployed.
- Migration `20260715160000_flowcordia_workflow_index` is applied and repository synchronization is healthy.
- The connected production branch has at least one valid canonical workflow.
- Studio remains limited to an internal organization while the draft migration is validated.
- No operator should expect this slice to write GitHub, compile, deploy, or execute workflows.

## Deployment sequence

1. Apply `20260716090000_flowcordia_workflow_drafts`.
2. Verify `flowcordia.workflow_draft` and `flowcordia.workflow_draft_audit_event`, partial active-draft uniqueness, checks, indexes, and foreign keys.
3. Deploy the webapp with existing Studio cohort access unchanged.
4. Open a valid repository workflow as a GitHub-write user and select **Start editing**.
5. Confirm one active draft is created with the exact indexed commit/blob/canonical base and version `1`.
6. Add, move, rename, connect, and remove test nodes. Confirm each accepted mutation increments the version once and appends one audit event.
7. Open the same draft in a second session, mutate the first session, and confirm the stale second-session version is rejected without document loss.
8. Push a changed version of the source workflow and synchronize. Confirm the old draft becomes read-only with a source-change warning.
9. Discard the stale draft and start again. Confirm the new draft binds the newest indexed source.
10. Verify GitHub contains no branch, commit, or pull request created by these actions.
11. Expand access only after conflict, integrity, persistence, and stale-base signals remain healthy.

## Operating signals

Monitor:

- active and discarded draft counts by organization/project/repository;
- draft age and time since last update;
- optimistic conflict rate;
- stale-source blocks;
- corrupt-document or integrity-hash failures;
- start/edit/discard command latency and normalized failures;
- audit append failures;
- drafts based on a commit different from the current workflow index.

Do not log full workflow documents, configuration values, credentials, request bodies, internal row IDs, or actor data beyond approved identifiers.

## Common failures

### Start editing is unavailable

Confirm the selected workflow is valid in the durable index, the index is settled, the user has GitHub-write permission, and Studio access is enabled. A draft must never be created from an invalid, stale, or unproven source.

### Edit reports a version conflict

Another session saved first. Refresh and review the latest durable graph. Do not retry the same command automatically against the new version.

### Draft base changed

The repository source moved after authoring began. The draft remains inspectable. Export/recovery tooling is not part of this slice; discard it and explicitly start from the current indexed source.

### Stored draft integrity failure

Disable authoring for the affected cohort, preserve the row and audit events, inspect database writes/backups, and treat the mismatch as an integrity incident. Do not bypass validation or rewrite the stored hash manually.

### Migration uniqueness failure

Before retrying, identify duplicate active rows for the same project/repository/workflow. Preserve all records, select the intended active draft through a reviewed recovery procedure, mark other rows discarded with audit evidence, then recreate the partial unique index.

## Rollback

1. Disable Studio cohort access or revert the draft-capable application routes and UI.
2. Keep the draft and audit tables so users' unfinished work and investigation evidence are preserved.
3. Restore the read-only Studio application behavior from the parent slice.
4. Do not delete drafts or audit events as part of an emergency application rollback.
5. Drop the tables only in a separate reviewed retention change after export and recovery requirements are resolved.

Disabling Studio stops new draft edits, tests, and publication. Existing generated proposal branches and pull requests remain auditable in GitHub and can be closed through normal repository policy. Rollback does not change Trigger.dev deployments, queues, run engine, supervisor, CLI, or customer workflow execution because publication does not automatically deploy or run an artifact.
