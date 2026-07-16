# Preview deployment and live run bridge

## Purpose

This slice closes the first governed runtime loop without creating a second deployment or run engine:

```text
published Studio draft
  -> deterministic proposal branch and pull request
  -> prepared Trigger.dev preview branch environment
  -> connected GitHub integration builds the pull-request head
  -> exact-head WorkerDeployment
  -> exact-version Flowcordia task run
  -> bounded run metadata
  -> live node status on the Studio canvas
```

Trigger.dev's connected GitHub integration owns the branch-event-to-build transition. Flowcordia does not insert `WorkerDeployment`, `BackgroundWorker`, or `TaskRun` rows. The integration contract is documented by Trigger.dev under [GitHub integration](https://trigger.dev/docs/github-integration).

## Deployment identity

Publication prepares the deterministic proposal branch with the inherited `UpsertBranchService` before GitHub writes the branch. This preserves existing preview limits, environment API-key creation, billing pause behavior, and organization/project ownership.

Studio recognizes a deployment only when all of these match:

- authorized organization and project;
- active connected repository;
- latest proposal for the selected workflow;
- exact proposal branch preview environment;
- exact proposal `headSha` and deployment `commitSHA`;
- deployed worker version in that preview environment.

A deployment from another branch, workflow, project, environment, or commit is never projected as ready.

Generated task source lives under `trigger/flowcordia/`. Trigger.dev automatically discovers the `trigger` root when `dirs` is not configured. A repository with explicit `dirs` must include `trigger/flowcordia` or its parent `trigger` directory.

## Live-run command

The Studio run command re-resolves every identity on the server. Browser input is limited to a workflow ID, expected proposal head, request UUID, and bounded JSON payload. The command additionally requires task-trigger permission for `flowcordia-<workflow-id>`.

The run is locked to the worker version belonging to the exact deployed proposal head. A request-scoped idempotency key makes transport retries safe without preventing a user from intentionally starting another run.

## Browser data boundary

The loader returns only:

- public proposal identity, branch, pull-request number, and head SHA;
- deployment short code, version, status, commit SHA, and timestamps;
- run friendly ID, status, timestamps, and bounded node statuses.

It does not return environment API keys, database IDs, payloads, outputs, credentials, generic run metadata, worker IDs, or raw runtime errors. Generated tasks write only operation and status for each node. Raw errors remain in inherited runtime logs.

Studio polls every five seconds only while a deployment or run is non-terminal. This is an intentionally bounded first projection over inherited runtime records; it does not replace Trigger.dev Realtime.

## Failure behavior

- Disabled preview deployments do not block proposal creation; Studio explains how to enable them.
- Preview capacity or setup failure leaves the governed proposal intact and reports preview unavailability.
- A changed proposal head fails the run command with a conflict and requires refresh.
- A deployed image that does not contain the generated task fails closed as `task_not_deployed`.
- Metadata that is oversized, malformed, version-mismatched, workflow-mismatched, or contains an invalid node record is ignored.
- Metadata observer failure cannot alter workflow execution behavior.
