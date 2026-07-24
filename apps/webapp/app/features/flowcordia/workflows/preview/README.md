# Flowcordia preview projection

This feature connects governed proposal branches to the inherited Trigger.dev preview environment and deployment model.

## Boundary

- `environment.server.ts` prepares the exact proposal branch as a preview environment before GitHub writes the branch. It reuses `UpsertBranchService`, plan limits, API-key creation, billing pause rules, and the existing connected-repository preview setting.
- `closure-installation.ts` validates durable closure schema/digest/workflow identity and derives the bounded `flowcordia-<workflow-id>` inventory expected on one exact worker. Unrelated tasks are ignored; missing, duplicate, malformed, or unrecorded closure state fails closed.
- `query.server.ts` reads the latest Flowcordia proposal, exact-head `WorkerDeployment`, matching closure task rows owned by that worker, and a bounded set of exact-version task runs in the proposal's server-owned idempotency namespace. A run is selected only when its versioned seed metadata matches the workflow, proposal, and head. It never creates deployment rows or bypasses the existing Git build pipeline.
- `trigger.server.ts` re-resolves the proposal, durable closure, branch environment, exact deployed worker, and complete expected task inventory before starting a version-locked root run through the inherited `TriggerTaskService`.
- `commands.server.ts` bounds browser input and requires both Studio write access and task-trigger permission.
- `presentation.ts` independently rechecks proposal identity, closure state, and worker lock, accepts only bounded Flowcordia metadata written by the generated task, and marks successful terminal node evidence as verified. It returns no environment API key, internal database ID, payload, output, generic metadata, idempotency key, worker ID, task row ID, or deployment credentials.

The existing GitHub integration remains responsible for turning a proposal pull request into a build. Flowcordia prepares the branch early enough for that integration, proves which deployment belongs to the proposal head, requires every reviewed closure member on the same worker, and polls only while deployment, closure installation, or run state is changing.
