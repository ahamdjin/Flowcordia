# Production closure activation proof

## Decision

A promoted Flowcordia workflow is production-ready only when the latest merged proposal, authoritative production deployment, exact worker, and complete immutable proposal closure agree. A deployed root task alone is not sufficient because production execution can begin and then fail when a reviewed child task is absent from the same worker.

## Authority chain

1. Select the latest merged proposal for the workflow inside the authorized repository scope.
2. Require its exact head, merge commit, durable closure schema, closure digest, and sorted workflow IDs.
3. Resolve the active production environment and latest deployment.
4. Require the deployment to be `DEPLOYED`, worker-backed, and built from the proposal merge commit.
5. Derive every expected `flowcordia-<workflow-id>` task from the durable closure identity.
6. Read only matching task rows owned by that exact production worker and environment.
7. Require every expected task exactly once before production becomes `READY` or an explicit proof run can start.
8. Lock the root run to the authoritative deployment version and retain existing proposal/merge/idempotency correlation.

Git remains the closure authority. The database stores the exact verified closure identity introduced by the governed proposal path and uses it only for bounded runtime readiness checks.

## Fail-closed states

- Legacy promoted proposals without closure identity require republishing through the governed closure path.
- Invalid schema, digest, ordering, uniqueness, or root membership is a durable identity failure.
- Missing child tasks keep production in a waiting state.
- Duplicate expected tasks are an invalid worker inventory.
- A deployment from any commit other than the latest merge commit is out of sync.
- Unrelated worker tasks are ignored.

## Browser boundary

Studio receives only public proposal identity, deployment version/commit, closure state/digest/counts, bounded missing workflow IDs, and trusted run proof. Worker IDs, task row IDs, environment credentials, payloads, outputs, generic metadata, and raw errors remain server-only.

The loader projection is observational. The production trigger command independently re-resolves the proposal, merge commit, durable closure, production environment, deployment, worker, and complete task inventory immediately before invoking the inherited `TriggerTaskService`.

## Exclusions

This contract proves that one promoted closure is installed on the authoritative production worker before explicit proof execution. It does not automatically activate public webhooks or schedules, preserve a configured protected-environment acceptance record, add simultaneous multi-workflow editing, or provide cross-workflow rollback UI.
