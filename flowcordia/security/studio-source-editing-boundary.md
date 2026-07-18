# Studio source-editing security boundary

## Security objective

Allow an authorized visual builder to propose bounded changes to an existing repository-owned JavaScript or TypeScript function while preserving GitHub review, exact source identity, tenant isolation, and Trigger.dev deployment boundaries.

## Trust decisions

| Input or capability | Authority |
| --- | --- |
| tenant, project, repository, installation, and branch | server-resolved project connection |
| workflow and draft identity | durable workflow index and draft store |
| editable function ID, path, and export | exact-commit repository function catalog |
| base source bytes and blob | installation-scoped exact-commit source read |
| current source buffer | durable database row with SHA-256 and optimistic version |
| proposal identity | server-generated workflow and source digest |
| source write | governed source-patch service on the deterministic proposal branch |
| execution | exact deployed proposal head and Trigger.dev worker version |

The browser may submit only a draft public ID, node public ID, source-buffer public ID, optimistic version, source SHA-256, and bounded replacement text. It cannot submit repository coordinates, a source path, a base blob, an export name, a branch, or installation credentials.

## Fail-closed cases

The operation is rejected when:

- the workflow index no longer proves the draft's exact base;
- the selected node is not a repository-owned typed function;
- the exact function catalog no longer agrees with the node;
- the source file is missing, binary, malformed UTF-8, oversized, or protected;
- the source commit, blob, path, export, hash, or optimistic version differs;
- a supplied reviewed-source set omits, duplicates, or mismatches a changed durable buffer;
- a source digest does not match the exact patch content;
- deterministic workflow compilation fails;
- GitHub publication is stale, ambiguous, or identity-conflicting;
- the final pull-request head cannot prove every exact source patch.

No fallback silently chooses the latest branch, writes a blind replacement, executes the buffer, or returns a successful proposal receipt.

## Data exposure

The Studio loader exposes source-buffer metadata only. Source text is intentionally absent from loader DTOs and audit/outbox events.

The explicit source-open command returns one bounded source file only after current authorization, active-draft scope, catalog identity, and exact repository proof. Provider messages and credentials are normalized before reaching the browser.

## Request and storage limits

- normal workflow-draft commands: 256 KiB request envelope;
- source-edit command: 640 KiB request envelope to account for JSON escaping;
- actual UTF-8 source file: 256 KiB maximum;
- source files per combined proposal: 32;
- combined source patch content: 1 MiB;
- source path: 512 characters;
- one durable source row per active draft and repository path.

The wider edit envelope does not widen the source contract. Source bytes are validated again before storage and publication, and PostgreSQL enforces the 256 KiB stored-text limit.

## Execution isolation

The webapp stores and publishes source text but never imports it, evaluates it, transpiles it dynamically, or invokes it. Structural Preview remains contract-driven and customer-code-free.

Only Trigger.dev's existing reviewed build and deployment path executes source code. Live Preview requires a ready deployment that matches the exact proposal head and task identity.

## Rollback

Disabling Flowcordia Studio removes the source workspace and write commands from user access without changing Trigger.dev execution. Existing draft buffers remain inert database state until discarded or removed under the established retention policy. No runtime drain or source-file rollback is required to disable the feature.
