# Flowcordia workflow Studio

This feature renders the real canonical workflows indexed from a project's connected production repository.

## Connections

- `query.server.ts` resolves the authenticated project and workflow-index scope.
- The durable index supplies workflow identity and exact source coordinates.
- `GitHubWorkflowStore` rereads that exact commit, blob, and path.
- `workflowSha256` proves the canonical document still matches the durable index.
- `presentation.ts` creates the browser-safe DTO.
- `WorkflowStudio.tsx` renders the read-only graph and node inspector.
- `commands.server.ts` performs an immediate, authorized full synchronization through the same durable service used by the worker.

## Browser boundary

The browser may choose only a public workflow ID and request `synchronize`. It cannot choose tenant, project, repository, branch, installation, commit, generation, lock, actor, or policy identity.

Configuration values are not serialized. The node inspector exposes key names, credential-reference names, runtime hints, and code-reference metadata so the graph is useful without turning Studio into a secret-disclosure surface.

## Deliberate exclusions

This feature does not edit nodes, move persisted positions, save documents, create proposals, compile code, deploy workers, trigger runs, or display live execution. Those capabilities require separate vertical boundaries and tests.
