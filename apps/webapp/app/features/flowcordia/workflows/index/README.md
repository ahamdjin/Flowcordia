# Durable workflow index

The workflow index is the durable bridge between a connected GitHub repository and the Flowcordia Studio read path.

## Files

- `scope.server.ts`: resolves and rechecks the organization, project, installation, repository, and production branch.
- `repository.server.ts`: typed raw-SQL persistence, generations, leases, transactional catalog replacement, audit, and webhook delivery ledger.
- `github.server.ts`: installation-scoped discovery and exact workflow content clients.
- `service.server.ts`: complete exact-commit indexing operation.
- `manual-claim.server.ts`: claims only the synchronization requested by the current authorized command.
- `worker.server.ts`: no-overlap background processing under the existing Flowcordia operations flag.
- `webhook.server.ts`: normalizes verified push events and schedules only matching tracked production branches.

## Replacement rule

A synchronization does not mutate durable entries until discovery and every exact content read have completed. A transaction then proves the same generation and lease, removes entries absent from the complete snapshot, upserts the snapshot, updates counts and observed commit, and appends audit evidence. Any error rolls back the replacement and preserves the previous good index.

Invalid canonical documents are part of a complete snapshot and are stored as `INVALID`. Transport, identity, truncation, scope, or availability errors fail the full synchronization.

## Runtime isolation

The index worker shares the existing default-off Flowcordia operations process lifecycle but not the Trigger.dev run engine, legacy workers, queue catalog, deployment engine, supervisor, or customer runtime.
