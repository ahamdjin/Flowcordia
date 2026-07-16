# Workflow drafts

This folder owns the durable authoring state between the repository-backed Studio read path and a future governed GitHub proposal. Draft storage preserves unfinished work, but Git remains the reviewed source of truth for published workflow definitions.

## Files

- `types.ts`: draft, source identity, and secret-free audit contracts.
- `errors.ts`: normalized draft failures safe for the Studio boundary.
- `repository.server.ts`: tenant-scoped raw-SQL storage, integrity verification, optimistic versions, discard, and audit.
- `service.server.ts`: exact indexed-source proof and deterministic edit orchestration.
- `commands.server.ts`: bounded browser command validation and minimal acknowledgements.

## Invariants

- The browser supplies only a public draft ID, expected version, workflow ID, and a bounded edit command.
- Organization, project, installation, repository, branch, actor, and GitHub credentials are resolved again on the server.
- One active shared draft may exist per project, repository, and workflow.
- Every mutation requires the exact current draft version.
- A draft is editable only while its base commit, blob, path, workflow ID, and canonical hash still match the durable workflow index.
- Stored workflow JSON is validated and its SHA-256 is recomputed before use.
- Audit payloads describe the command and identities, never workflow configuration values, credential values, or the full document.
- Discard is a durable terminal transition. It does not delete audit evidence or write to GitHub.

This feature does not create branches, commits, pull requests, deployments, executions, or Trigger.dev tasks.
