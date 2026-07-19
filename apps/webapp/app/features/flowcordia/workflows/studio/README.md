# Flowcordia workflow Studio

This feature renders and edits canonical workflows indexed from a project's connected production repository. Studio remains a browser client of server-owned identity, authorization, GitHub, proposal, deployment, and runtime boundaries.

## Component ownership

- `query.server.ts` resolves the authenticated project, connected repository, exact workflow-index scope, active draft, function catalog, proposal preview, and bounded browser projection.
- `WorkflowStudio.tsx` owns repository synchronization, durable draft editing, proposal publication, canvas layout, node inspection, preview status, polling while deployment or execution is active, and live node projection.
- `WorkflowStudioTestingPanel.tsx` is the only browser owner of structural-preview and exact-deployment live-run submissions.
- `WorkflowFunctionTestPanel.tsx` owns schema-driven input, fixture selection, session-only sensitive fields, advanced JSON fallback, and test-result presentation.
- `testing-command.ts` is the pure contract for test availability and the exact browser command shapes.
- `presentation.ts` creates browser-safe graph and index DTOs without serializing configuration values.
- `commands.server.ts` performs an immediate authorized full synchronization through the durable index service.

The testing panel is composed beside the canvas. It does not wrap Studio, inject CSS, hide duplicate controls, or infer permissions from presentation state alone.

## Connections

- The durable workflow index supplies public workflow identity and exact source coordinates.
- `GitHubWorkflowStore` rereads the exact commit, blob, and path selected by the server.
- `workflowSha256` proves the canonical document still matches the durable index.
- The function catalog query reads `.flowcordia/functions.json` at the graph's exact commit and exposes bounded metadata only.
- Structural preview submits one durable draft ID, expected draft version, JSON payload, and optional bounded fixture identity to the draft command route.
- Live preview submits one public workflow ID, server-presented exact proposal head, browser-generated request UUID, and JSON payload to the preview command route. The server re-resolves every trusted identity before execution.
- Preview polling remains in `WorkflowStudio.tsx` because the canvas owns deployment status and correlated live node evidence, not the command that starts a run.

## Browser boundary

The browser may choose a public workflow ID, request synchronization, submit bounded visual edits, select a repository function and fixture, provide a test payload, and request an exact-head preview run.

It cannot choose tenant, organization, project, installation, repository, production branch, database identity, deployment worker, environment API key, actor, policy, or runtime credentials. It cannot turn a stale draft, unavailable graph, missing write permission, non-ready preview, or missing task-trigger permission into an enabled action.

Configuration values are not serialized by the read projection. The node inspector exposes key names, credential-reference names, runtime hints, and code-reference metadata so the graph remains useful without becoming a secret-disclosure surface.

## Function ownership

Custom functions are resolved again on the server at the durable draft base commit. Studio copies reviewed schemas and code references into developer-owned nodes. Generated task source imports repository exports statically.

Structural preview never executes repository code. It uses selected fixture contracts to shape downstream evidence. Live execution is available only after an exact proposal head has a ready deployment and the user has inherited task-trigger permission.

## Failure behavior

- Structural testing is disabled for missing or stale drafts, repository-index movement, load errors, or missing Studio write permission.
- Live testing is disabled unless the preview is `READY`, has an exact head, and task-trigger authorization is present.
- Submitted commands use one fetcher each and revalidate only after the owned mutation settles.
- Server failures return bounded messages. Payloads, outputs, credentials, internal IDs, provider metadata, stack traces, and raw exceptions are not added to the route-level status banners.
- The canvas continues polling only while deployment or the correlated run is active.

## Verification

The Studio testing composition requires:

- unit coverage for visibility, structural and live authorization gates, and exact command objects;
- route-level verification that only `WorkflowStudioTestingPanel` submits `operation: "test"` and `operation: "run"`;
- a source assertion that the removed compatibility shell and hidden `Preview test payload` control do not return;
- production webapp typecheck, build, unit-test shards, and E2E checks on the exact pull-request head;
- connected acceptance for structural fixture use, exact-head live execution, trusted node evidence, and failure projection.
