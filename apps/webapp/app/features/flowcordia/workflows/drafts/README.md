# Workflow drafts

This folder owns the durable authoring state between the repository-backed Studio read path and a future governed GitHub proposal. Draft storage preserves unfinished work, but Git remains the reviewed source of truth for published workflow definitions.

## Files

- `types.ts`: draft, source identity, and secret-free audit contracts.
- `errors.ts`: normalized draft failures safe for the Studio boundary.
- `repository.server.ts`: tenant-scoped raw-SQL storage, integrity verification, optimistic versions, discard, and audit.
- `service.server.ts`: exact indexed-source proof plus deterministic edit, safe-test, compilation, and publication preflight.
- `commands.server.ts`: bounded browser commands for editing, dry-run testing, and governed publication.

## Invariants

- The browser supplies only a public draft ID, expected version, workflow ID, and a bounded edit command.
- Custom-function commands supply only a function ID and position; the service rereads the full definition at the draft base commit.
- Organization, project, installation, repository, branch, actor, and GitHub credentials are resolved again on the server.
- One active shared draft may exist per project, repository, and workflow.
- Every mutation requires the exact current draft version.
- A draft is editable only while its base commit, blob, path, workflow ID, and canonical hash still match the durable workflow index.
- Stored workflow JSON is validated and its SHA-256 is recomputed before use.
- Audit payloads describe the command and identities, never workflow configuration values, credential values, or the full document.
- Discard is a durable terminal transition. It does not delete audit evidence or write to GitHub.
- Testing uses preview adapters: HTTP is simulated, waits do not delay, and repository code is not executed.
- Publication requires an exact current draft version, a current indexed base, real changes, and a successful deterministic compilation.
- Proposal identity is deterministic for a draft public ID and version, making retries idempotent.
- Visual configuration rejects likely inline secrets before durable storage.

Publication creates a governed branch, workflow commit, generated task artifact, and draft pull request through the existing proposal control plane. It does not deploy or execute that task automatically.
