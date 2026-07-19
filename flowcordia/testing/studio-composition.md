# Studio testing composition

## Purpose

Prove that Flowcordia Studio has one explicit browser owner for structural preview and live preview execution. This prevents duplicate commands, hidden controls, divergent payload state, and permission logic that can drift between components.

## Static ownership assertions

The final source tree must satisfy all of the following:

- `WorkflowStudioTestingShell.tsx` does not exist.
- No Studio component injects CSS using `data-flowcordia-testing-shell`.
- `WorkflowStudio.tsx` does not contain `operation: "test"`, `operation: "run"`, `Preview test payload`, `previewCommandPath`, or `canTriggerPreview`.
- The workflow route renders `WorkflowStudioTestingPanel` directly before the canvas.
- `WorkflowStudioTestingPanel` owns exactly one structural fetcher and one live fetcher.
- `testing-command.ts` owns the pure availability decision and exact command construction.

## Contract tests

Unit tests must cover:

1. no graph means the testing surface is hidden and both actions are disabled;
2. structural preview requires a writable, current, non-stale draft and an error-free loaded graph;
3. live preview requires task-trigger permission, preview state `READY`, and an exact proposal head;
4. structural and live permissions remain independent;
5. structural commands contain only operation, durable draft identity, expected version, payload, and an optional bounded fixture identity;
6. live commands contain only operation, public workflow ID, exact expected head, request UUID, and payload.

## Connected acceptance

In the configured reference repository:

1. open a current draft and confirm the schema-driven panel appears;
2. select a repository fixture and run structural preview;
3. confirm the real repository function does not execute in structural mode;
4. confirm stale draft, index movement, and removed write permission disable structural submission;
5. publish the proposal and wait for the exact-head preview deployment;
6. confirm live submission remains disabled before deployment is ready or without task-trigger permission;
7. run the exact deployment and confirm the canvas, not the testing panel, owns active polling and trusted node projection;
8. confirm a failed command produces a bounded route banner without payload, output, credentials, internal identity, provider metadata, stack trace, or raw exception;
9. reload Studio and confirm no hidden legacy textarea or duplicate live-run button exists.

## Rollback

Revert the composition commit. No schema, stored draft, proposal, deployment, run, or audit migration is involved. The rollback restores the previous browser composition only; server command contracts remain unchanged.
