# Flowcordia workflow Studio

This feature renders the real canonical workflows indexed from a project's connected production repository.

## Connections

- `query.server.ts` resolves the authenticated project and workflow-index scope.
- The durable index supplies workflow identity and exact source coordinates.
- `GitHubWorkflowStore` rereads that exact commit, blob, and path.
- `workflowSha256` proves the canonical document still matches the durable index.
- `presentation.ts` creates the browser-safe DTO.
- `WorkflowStudio.tsx` renders the read-only graph and node inspector.
- The function catalog query reads `.flowcordia/functions.json` at the graph's exact commit and projects only bounded metadata.
- `commands.server.ts` performs an immediate, authorized full synchronization through the same durable service used by the worker.

## Browser boundary

The browser may choose a public workflow ID, request `synchronize`, submit bounded visual edits, and select a repository function ID. It cannot choose tenant, project, repository, branch, installation, commit, schema, code reference, generation, lock, actor, or policy identity.

Configuration values are not serialized. The node inspector exposes key names, credential-reference names, runtime hints, and code-reference metadata so the graph is useful without turning Studio into a secret-disclosure surface.

## Function ownership

Custom functions are resolved again on the server at the draft base commit. Studio copies the reviewed schemas and code reference into a developer-owned node, which may be moved or renamed but not configured or removed visually. Generated task source imports the repository export statically.

Repository code editing, custom-function fixtures/mocks, and schema-driven configuration forms remain separate Phase 2 work.
