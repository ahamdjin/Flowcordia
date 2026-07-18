# Exact-head function validation connections

## Connection map

```text
Studio validation panel
  -> authenticated function-validation resource route
  -> workflow-index repository scope
  -> durable proposal store
  -> exact-head GitHub workflow and function catalog stores
  -> server-owned validation suite
  -> preview RuntimeEnvironment
  -> exact-commit WorkerDeployment
  -> exact-version BackgroundWorkerTask
  -> TriggerTaskService
  -> TaskRun status-only metadata
  -> shared validation query
  -> Studio panel and promotion gate
```

## Component ownership

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Studio panel | Display bounded state and request run/retry | Submit fixtures, expected output, source, or deployment identity |
| Validation resource route | Enforce feature access, GitHub write authorization, task-trigger RBAC, and request bounds | Trust browser repository or suite data |
| Suite builder | Resolve exact proposal, workflow, catalog, fixtures, and digest | Execute repository code |
| Runtime compiler | Emit validation task beside workflow task using the same static imports | Embed fixture values in generated source |
| Trigger service | Lock execution to exact deployed worker version and idempotency identity | Select a moving/latest deployment |
| Validation runtime | Recompute digest, execute handlers, enforce schemas, compare output | Return values, exception text, or stacks |
| Validation query | Match proposal/head/digest/worker/run evidence and produce one state | Treat metadata alone as successful execution |
| Promotion gate | Allow only `PASSED` or `NOT_REQUIRED` | Bypass the shared query or weaken exact-head identity |

## Existing systems reused

This slice intentionally reuses:

- the durable Flowcordia proposal store;
- installation-scoped GitHub workflow and function-catalog readers;
- Trigger.dev preview environments and connected GitHub builds;
- WorkerDeployment and BackgroundWorkerTask discovery;
- TriggerTaskService idempotent exact-version execution;
- TaskRun metadata and status records;
- existing Studio feature access and RBAC.

No new deployment, worker, queue, scheduler, test-runner service, or customer-code execution process is introduced.

## Identity joins

A validation result is accepted only when the following join is complete:

```text
organization + project + repository
  + workflow ID
  + proposal ID
  + proposal branch
  + exact head SHA
  + preview environment
  + deployment commit SHA
  + deployed worker ID/version
  + validation task ID
  + canonical suite digest
  + TaskRun terminal success
```

Any missing or conflicting identity produces a waiting, blocked, unavailable, or failed state. It never falls back to a nearby proposal, latest branch, latest deployment, or similarly named task.
