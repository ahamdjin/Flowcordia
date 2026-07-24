# Production execution proof

## Purpose

Prove that the latest governed Flowcordia promotion is the complete version currently deployed and executed in production. This is a real production action, not a preview or repository-only simulation.

The proof surface is intentionally separate from structural testing, exact-head preview execution, promotion, and rollback.

## Product contract

For one selected workflow, Flowcordia resolves:

1. the most recently updated proposal in `MERGED` state;
2. that proposal's exact head, merge commit, closure schema, closure digest, and sorted workflow IDs;
3. the project's production environment;
4. the latest production deployment record, regardless of status;
5. every generated `flowcordia-<workflow-id>` task required by the promoted closure on that exact worker;
6. only root runs locked to that deployment's worker and production-proof idempotency namespace.

The latest production deployment record is final authority. Flowcordia never falls back to an older deployed worker when a newer deployment is building, failed, missing a worker, points at another commit, or lacks a reviewed child task.

## Availability states

- `NOT_PROMOTED`: no complete merged proposal exists for the workflow.
- `UNAVAILABLE`: the production read model could not be loaded safely.
- `WAITING_FOR_DEPLOYMENT`: no production environment or deployment record with a commit is available.
- `DEPLOYING`: the latest deployment is for the exact merge commit but is not yet `DEPLOYED` with a worker.
- `OUT_OF_SYNC`: the latest deployment commit differs from the latest promoted merge commit.
- `WAITING_FOR_CLOSURE`: the authoritative worker exists but one or more promoted workflow tasks are still missing.
- `FAILED`: the exact deployment failed, closure identity is absent or invalid, or the expected worker inventory is contradictory.
- `READY`: the latest deployment is `DEPLOYED`, has a worker, its commit equals the latest promoted merge commit, and every closure task exists exactly once on that worker.

Only `READY` can enable production execution.

## Explicit execution

An authorized operator must:

1. confirm the workflow, proposal, merge commit, deployment version, and closure task counts shown by Studio;
2. use a non-sensitive, deterministic, idempotent fixture;
3. type `RUN_FLOWCORDIA_PRODUCTION_PROOF` exactly;
4. submit the production command through the authenticated Studio route.

The browser may provide only:

- public workflow ID;
- public proposal ID already presented by the server;
- exact merge commit already presented by the server;
- one request UUID;
- one JSON payload under the bounded request limit;
- the exact destructive confirmation.

The browser cannot choose closure membership or digest, organization, project, repository, installation, environment, deployment, worker, task record, credentials, actor, or policy identity.

## Server revalidation

Before triggering, the server re-resolves:

- Studio feature access;
- project and connected-repository scope;
- task-trigger RBAC;
- the latest merged proposal for the workflow;
- exact proposal ID and merge commit;
- durable closure schema, digest, ordering, uniqueness, and root membership;
- the production environment;
- the latest production deployment record;
- `DEPLOYED` status, worker presence, and exact commit equality;
- every expected closure task on that exact worker.

Inline secret-like payloads are rejected in both the browser and server command boundaries.

## Version lock and correlation

The root run is locked to the authoritative production deployment version through the existing `TriggerTaskService`. Child execution remains native Trigger.dev task invocation from the same reviewed build.

Its idempotency key is namespaced by:

```text
workflow ID + proposal ID + merge commit + request UUID
```

Seed metadata contains only the strict production identity. Studio accepts run evidence only when all of the following agree:

- complete closure installation is `READY`;
- workflow ID;
- proposal ID;
- merge commit;
- production idempotency namespace;
- deployed worker lock;
- strict metadata shape;
- bounded trusted node metadata.

A successful terminal run without trustworthy node evidence is not verified.

## Browser-safe evidence

Studio may show:

- proposal ID;
- proposal head and merge commit;
- closure state, digest, expected/installed counts, and bounded missing workflow IDs;
- deployment public short code, version, status, commit, and times;
- run friendly ID, status, times, proof state, and bounded node states.

It does not expose:

- payloads or outputs;
- environment, worker, task, run, installation, or database internal IDs;
- credentials or resolved headers;
- actor or policy identity;
- provider responses, arbitrary metadata, stack traces, or raw exceptions.

The payload editor is local component state only. It is not written to session storage, workflow state, proposal state, Git, or Flowcordia audit records.

## Failure and retry behavior

- identity movement fails with a non-retryable promotion conflict;
- production deployment movement or incompleteness fails as retryable readiness;
- legacy or malformed closure identity fails non-retryably and requires governed republishing;
- missing child tasks fail before run creation and remain retryable while deployment discovery completes;
- duplicate expected tasks fail as an invalid worker inventory;
- an unknown runtime failure returns a bounded retryable error;
- duplicate identical request UUIDs use the existing runtime idempotency boundary;
- a new proof attempt must use a new request UUID after the operator rechecks production state;
- a run already started is never compensated or rolled back automatically.

## Connected acceptance

Repository CI proves contracts, source ownership, formatting, type safety, build safety, and failure behavior. It does not prove a real production deployment or side effect.

Connected acceptance must use a dedicated internal organization, project, repository, and idempotent external fixture. Record the unchanged application commit, promoted merge commit, closure digest and expected/installed counts, production deployment version, run friendly ID, terminal status, and proof state without recording the payload or output.

## Rollback boundary

This feature proves production execution only. It does not restore a prior version.

A Flowcordia rollback must create a new governed proposal that restores a previously reviewed workflow and source closure, pass current checks and approvals, promote normally, deploy as the newest production version, verify the restored closure on the authoritative worker, and preserve the original run/audit history.
