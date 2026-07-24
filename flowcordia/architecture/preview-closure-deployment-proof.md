# Preview closure deployment proof

## Decision

A preview deployment is runnable only when the exact proposal head, immutable proposal closure, exact preview worker, and installed task inventory agree. Discovering only the root task is insufficient because a parent can begin successfully and fail later when a reviewed child task is absent from the same worker.

## Durable identity

After GitHub proposal creation succeeds, the control plane persists only bounded, non-secret closure identity from the exact verified proposal head:

- closure schema version;
- closure digest; and
- sorted unique workflow IDs, including the proposal root.

The control plane never accepts these fields from the browser. Existing proposals without closure identity remain visible but cannot claim closure-ready preview execution; they must be republished through the governed closure path. Git remains the closure authority; the database stores only the exact verified identity needed for bounded runtime readiness checks.

A GitHub proposal recovered while its local create receipt is still incomplete remains in retryable `CREATING` state until closure identity is durable. Reconciliation cannot silently promote that record to runnable `DRAFT` state without the closure.

## Exact-worker proof

For one proposal head, Flowcordia resolves the existing preview environment and exact deployed `WorkerDeployment`. It then derives the expected task slugs from the persisted workflow IDs and reads only matching `BackgroundWorkerTask` rows owned by that worker and environment.

The proof is `READY` only when:

- stored closure identity is structurally valid and bound to the proposal root;
- the closure contains between 1 and 100 sorted unique workflow IDs;
- the exact proposal head owns a deployed worker;
- every expected `flowcordia-<workflow-id>` task exists exactly once on that worker; and
- the trigger command remains pinned to that exact deployment version.

Unrelated tasks are ignored. Missing, duplicate, malformed, stale-worker, or unrecorded closure state fails closed.

## Server and browser boundaries

Studio receives only closure state, digest, expected and installed counts, and bounded missing workflow IDs. Database IDs, worker IDs, task row IDs, environment credentials, payloads, outputs, and raw deployment errors remain server-only.

The preview query is an observational projection. The trigger command is authoritative: it re-resolves the proposal, exact head, preview environment, deployed worker, and complete task inventory immediately before calling the inherited `TriggerTaskService`. Browser readiness is never authorization.

## Failure behavior

A deployment that is still discovering child tasks reports waiting state. Invalid or contradictory durable closure identity reports failure. Trigger requests return a bounded retryable error for incomplete worker installation and a non-retryable error for invalid or absent durable closure identity.

## Exclusions

This proof establishes exact-worker installation for one immutable proposal closure. It does not yet provide connected protected-environment evidence, production closure activation proof, simultaneous multi-workflow Studio editing, mixed-child parallel orchestration, or cross-workflow rollback UI.
